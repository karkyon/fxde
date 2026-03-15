/**
 * apps/api/src/modules/plugins-ranking/service/reliability-scoring.service.ts
 *
 * PluginEventResult を集計して PluginReliability を upsert する。
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService }      from '../../../prisma/prisma.service';

@Injectable()
export class ReliabilityScoringService {
  private readonly logger = new Logger(ReliabilityScoringService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 全 plugin（または指定 pluginKey）の PluginReliability を再計算して保存する。
   */
  async recompute(pluginKey?: string): Promise<void> {
    // 対象 pluginKey 一覧を取得
    const pluginKeys = pluginKey
      ? [pluginKey]
      : await this._distinctPluginKeys();

    for (const key of pluginKeys) {
      await this._recomputeOne(key);
    }
  }

  // ── 内部: 1 plugin の集計 ───────────────────────────────────────────────

  private async _recomputeOne(pluginKey: string): Promise<void> {
    // 当該 plugin の全 PluginEventResult を取得（returnPct が主指標）
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
    const expectancy      = avgReturn;  // v1: avg(returnPct)
    const avgMfe          = this._avg(mfes);
    const avgMae          = this._avg(maes);
    const stabilityScore  = this._stabilityScore(returnPcts);
    const confidenceScore = this._confidenceScore(sampleSize);

    // 正規化（v1: tanh で -1〜1 を 0〜1 に変換）
    const expectancyNorm = this._normalizeTanh(expectancy);
    const avgReturnNorm  = this._normalizeTanh(avgReturn);

    // 無効シグナル率（v1: MAE が MFE を大幅に上回るケース）
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

    // upsert（pluginKey 単位。v1 は symbol/timeframe 集約なし）
    await this.prisma.pluginReliability.upsert({
      where: {
        // ユニーク制約がないので、findFirst → create/update パターン
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

  /**
   * Controller から呼び出す PluginReliability 一覧取得。
   * symbol / timeframe でフィルタ可能。
   */
  async findAll(filter?: { symbol?: string; timeframe?: string }) {
    return this.prisma.pluginReliability.findMany({
      where: {
        ...(filter?.symbol    ? { symbol: filter.symbol }       : {}),
        ...(filter?.timeframe ? { timeframe: filter.timeframe } : {}),
      },
      orderBy: { reliabilityScore: 'desc' },
    });
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

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

  /** tanh で任意の実数を 0〜1 に正規化 */
  private _normalizeTanh(value: number): number {
    // tanh(value) ∈ (-1, 1) → (0, 1)
    return (Math.tanh(value) + 1) / 2;
  }

  private _determineState(score: number, sampleSize: number): string {
    if (score < 0.30 && sampleSize >= 100) return 'stop_candidate';  // auto_stop 条件
    if (score < 0.40) return 'stop_candidate';
    if (score < 0.55) return 'suppressed';
    if (score < 0.70) return 'demoted';
    return 'active';
  }
}