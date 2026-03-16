/**
 * apps/api/src/modules/plugins-ranking/service/reliability-scoring.service.ts
 *
 * PluginEventResult を集計して PluginReliability を upsert する。
 *
 * 追加: getConditionBreakdown(pluginKey)
 *       patternType / symbol+timeframe / direction 別の条件別統計を返す。
 *       既存スコア算出ロジックは一切変更しない。
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService }      from '../../../prisma/prisma.service';

// ── 条件別 breakdown の行型 ──────────────────────────────────────────────
export interface ConditionBreakdownRow {
  key:        string;
  sampleSize: number;
  winRate:    number;
  avgReturn:  number;
}

export interface PluginConditionBreakdown {
  pluginKey:      string;
  byPattern:      ConditionBreakdownRow[];
  bySymbolTf:     ConditionBreakdownRow[];
  byDirection:    ConditionBreakdownRow[];
  bySession:      ConditionBreakdownRow[];
  byTrend:        ConditionBreakdownRow[];
  byAtrRegime:    ConditionBreakdownRow[];
  totalEvaluated: number;
}

@Injectable()
export class ReliabilityScoringService {
  private readonly logger = new Logger(ReliabilityScoringService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 全 plugin（または指定 pluginKey）の PluginReliability を再計算して保存する。
   */
  async recompute(pluginKey?: string): Promise<void> {
    const pluginKeys = pluginKey
      ? [pluginKey]
      : await this._distinctPluginKeys();

    for (const key of pluginKeys) {
      await this._recomputeOne(key);
    }
  }

  // ── 内部: 1 plugin の集計 ───────────────────────────────────────────────

  private async _recomputeOne(pluginKey: string): Promise<void> {
    const results = await this.prisma.pluginEventResult.findMany({
      where:  { event: { pluginKey } },
      select: { returnPct: true, mfe: true, mae: true },
    });

    const sampleSize = results.length;

    if (sampleSize === 0) {
      this.logger.debug(`[ReliabilityScoring] no results for ${pluginKey}, skip`);
      return;
    }

    const returnPcts = results.map((r) => r.returnPct);
    const mfes       = results.map((r) => r.mfe);
    const maes       = results.map((r) => r.mae);

    const winCount = returnPcts.filter((r) => r > 0).length;
    const winRate  = winCount / sampleSize;

    const avgReturn       = this._avg(returnPcts);
    const expectancy      = avgReturn;
    const avgMfe          = this._avg(mfes);
    const avgMae          = this._avg(maes);
    const stabilityScore  = this._stabilityScore(returnPcts);
    const confidenceScore = this._confidenceScore(sampleSize);

    const expectancyNorm = this._normalizeTanh(expectancy);
    const avgReturnNorm  = this._normalizeTanh(avgReturn);

    const invalidCount      = results.filter((r) => r.mae > r.mfe * 2).length;
    const invalidSignalRate = invalidCount / sampleSize;
    const penaltyFactor     = invalidSignalRate > 0.4 ? 0.6 : 1.0;

    const reliabilityScore =
      (
        winRate         * 0.30 +
        expectancyNorm  * 0.25 +
        avgReturnNorm   * 0.10 +
        stabilityScore  * 0.15 +
        confidenceScore * 0.20
      ) * penaltyFactor;

    const state = this._determineState(reliabilityScore, sampleSize);

    await this.prisma.pluginReliability.upsert({
      where: {
        id: await this._findOrDefaultId(pluginKey),
      },
      update: {
        sampleSize,
        winRate,
        expectancy,
        avgReturn,
        avgMfe,
        avgMae,
        reliabilityScore,
        stabilityScore,
        confidenceScore,
        state,
      },
      create: {
        pluginKey,
        symbol:           null,
        timeframe:        null,
        sampleSize,
        winRate,
        expectancy,
        avgReturn,
        avgMfe,
        avgMae,
        reliabilityScore,
        stabilityScore,
        confidenceScore,
        state,
      },
    });

    this.logger.log(
      `[ReliabilityScoring] ${pluginKey}: score=${reliabilityScore.toFixed(3)} state=${state} n=${sampleSize}`,
    );
  }

  // ── 公開 API ─────────────────────────────────────────────────────────────

  async findAll(filter?: { symbol?: string; timeframe?: string }) {
    return this.prisma.pluginReliability.findMany({
      where: {
        ...(filter?.symbol    ? { symbol: filter.symbol }       : {}),
        ...(filter?.timeframe ? { timeframe: filter.timeframe } : {}),
      },
      orderBy: { reliabilityScore: 'desc' },
    });
  }

  /**
   * 条件別 breakdown を返す。
   * - patternType 別（metadata.patternType）
   * - symbol/timeframe 別
   * - direction 別
   *
   * 既存スコア算出ロジックを一切変更しない。
   * PluginEvent.results の candleOffset=1 を primary metric とする。
   */
  async getConditionBreakdown(pluginKey: string): Promise<PluginConditionBreakdown> {
    const events = await this.prisma.pluginEvent.findMany({
      where: { pluginKey, eventType: 'signal' },
      select: {
        id:        true,
        symbol:    true,
        timeframe: true,
        direction: true,
        metadata:  true,
        results: {
          select:  { returnPct: true, candleOffset: true },
          orderBy: { candleOffset: 'asc' },
          take: 1,
        },
      },
    });

    // 評価済み行のみ
    const rows = events
      .map((e) => {
        const meta        = e.metadata as Record<string, unknown> | null;
        const patternType = (meta?.['patternType'] as string) ?? 'unknown';
        const returnPct   = e.results[0]?.returnPct ?? null;
        const context     = meta?.['context'] as Record<string, unknown> | null;
        return {
          symbol:      e.symbol,
          timeframe:   e.timeframe,
          direction:   e.direction ?? 'NEUTRAL',
          patternType,
          returnPct,
          session:     (context?.['time'] as Record<string, unknown> | null)?.['session'] as string ?? 'unknown',
          currentTrend:(context?.['trend'] as Record<string, unknown> | null)?.['currentTrend'] as string ?? 'unknown',
          atrRegime:   (context?.['volatility'] as Record<string, unknown> | null)?.['atrRegime'] as string ?? 'unknown',
        };
      })
      .filter((r): r is typeof r & { returnPct: number } => r.returnPct !== null);

    const byPattern   = this._groupAndCalc(rows, (r) => r.patternType);
    const bySymbolTf  = this._groupAndCalc(rows, (r) => `${r.symbol}/${r.timeframe}`);
    const byDirection = this._groupAndCalc(rows, (r) => r.direction);
    const bySession   = this._groupAndCalc(rows, (r) => r.session);
    const byTrend     = this._groupAndCalc(rows, (r) => r.currentTrend);
    const byAtrRegime = this._groupAndCalc(rows, (r) => r.atrRegime);

    return {
      pluginKey,
      byPattern,
      bySymbolTf,
      byDirection,
      bySession,
      byTrend,
      byAtrRegime,
      totalEvaluated: rows.length,
    };
  }

  // ── 内部ヘルパー ─────────────────────────────────────────────────────────

  private _groupAndCalc<T extends { returnPct: number }>(
    items:  T[],
    keyFn:  (item: T) => string,
  ): ConditionBreakdownRow[] {
    const groups = new Map<string, number[]>();
    for (const item of items) {
      const key = keyFn(item);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item.returnPct);
    }
    return [...groups.entries()]
      .map(([key, returns]) => ({
        key,
        sampleSize: returns.length,
        winRate:    returns.filter((r) => r > 0).length / returns.length,
        avgReturn:  this._avg(returns),
      }))
      .sort((a, b) => b.sampleSize - a.sampleSize);
  }

  private async _findOrDefaultId(pluginKey: string): Promise<string> {
    const existing = await this.prisma.pluginReliability.findFirst({
      where:  { pluginKey, symbol: null, timeframe: null },
      select: { id: true },
    });
    return existing?.id ?? 'NOT_FOUND_CREATE';
  }

  private async _distinctPluginKeys(): Promise<string[]> {
    const rows = await this.prisma.pluginEvent.findMany({
      distinct: ['pluginKey'],
      select:   { pluginKey: true },
    });
    return rows.map((r) => r.pluginKey);
  }

  private _avg(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((s, v) => s + v, 0) / values.length;
  }

  private _stddev(values: number[]): number {
    if (values.length < 2) return 0;
    const avg      = this._avg(values);
    const variance = values.reduce((s, v) => s + (v - avg) ** 2, 0) / values.length;
    return Math.sqrt(variance);
  }

  private _stabilityScore(returnPcts: number[]): number {
    const std = this._stddev(returnPcts);
    return 1 / (1 + std);
  }

  private _confidenceScore(sampleSize: number): number {
    if (sampleSize >= 100) return 1.0;
    if (sampleSize >= 50)  return 0.8;
    if (sampleSize >= 20)  return 0.6;
    return 0.35;
  }

  private _normalizeTanh(value: number): number {
    return (Math.tanh(value) + 1) / 2;
  }

  private _determineState(score: number, sampleSize: number): string {
    if (score < 0.30 && sampleSize >= 100) return 'stop_candidate';
    if (score < 0.40) return 'stop_candidate';
    if (score < 0.55) return 'suppressed';
    if (score < 0.70) return 'demoted';
    return 'active';
  }

  /**
   * 生 PluginEvent 履歴を返す（drilldown 用）
   * eventType = 'signal' のみ。最新 limit 件降順。
   */
  async getRecentEvents(pluginKey: string, limit = 50) {
    const events = await this.prisma.pluginEvent.findMany({
      where:   { pluginKey, eventType: 'signal' },
      orderBy: { emittedAt: 'desc' },
      take:    limit,
      select: {
        id:         true,
        symbol:     true,
        timeframe:  true,
        direction:  true,
        price:      true,
        confidence: true,
        metadata:   true,
        emittedAt:  true,
        results: {
          select: { returnPct: true, candleOffset: true },
          orderBy: { candleOffset: 'asc' },
          take: 1,
        },
      },
    });
 
    return events.map((e) => {
      const meta        = e.metadata as Record<string, unknown> | null;
      const patternType = (meta?.['patternType'] as string) ?? null;
      const returnPct   = e.results[0]?.returnPct ?? null;
      const context = meta?.['context'] as Record<string, unknown> | null;
      const session      = (context?.['time']       as Record<string,unknown> | null)?.['session']      as string | null ?? null;
      const currentTrend = (context?.['trend']      as Record<string,unknown> | null)?.['currentTrend'] as string | null ?? null;
      const atrRegime    = (context?.['volatility'] as Record<string,unknown> | null)?.['atrRegime']    as string | null ?? null;

      return {
        id:           e.id,
        symbol:       e.symbol,
        timeframe:    e.timeframe,
        direction:    e.direction,
        price:        e.price,
        confidence:   e.confidence,
        patternType,
        returnPct,
        evaluated:    returnPct !== null,
        emittedAt:    e.emittedAt.toISOString(),
        session,
        currentTrend,
        atrRegime,
      };
    });
  }
}
