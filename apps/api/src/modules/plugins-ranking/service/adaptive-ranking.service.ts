/**
 * apps/api/src/modules/plugins-ranking/service/adaptive-ranking.service.ts
 *
 * PluginReliability を読み込み、PluginAdaptiveDecision を生成・保存する。
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService }      from '../../../prisma/prisma.service';

@Injectable()
export class AdaptiveRankingService {
  private readonly logger = new Logger(AdaptiveRankingService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 全 plugin の Reliability を読み込み、ランキングを決定して保存する。
   */
  async runRanking(): Promise<void> {
    const reliabilities = await this.prisma.pluginReliability.findMany({
      orderBy: { reliabilityScore: 'desc' },
    });

    if (reliabilities.length === 0) {
      this.logger.debug('[AdaptiveRanking] no reliability records, skip');
      return;
    }

    const now = new Date();

    const decisions = reliabilities.map((rel, index) => {
      const globalScore     = rel.reliabilityScore;
      const contextualScore = globalScore;  // v1: contextualScore = globalScore
      const finalRankScore  = globalScore * 0.45 + contextualScore * 0.55;
      const rankPosition    = index + 1;

      const isAutoStop = rel.reliabilityScore < 0.30 && rel.sampleSize >= 100;
      const action     = isAutoStop ? 'auto_stop' : this._actionFromState(rel.state);

      return {
        pluginKey:       rel.pluginKey,
        symbol:          rel.symbol,
        timeframe:       rel.timeframe,
        contextHash:     null,
        globalScore,
        contextualScore,
        finalRankScore,
        rankPosition,
        action,
        reasonCodes:     { state: rel.state, sampleSize: rel.sampleSize },
        decidedAt:       now,
      };
    });

    await this.prisma.pluginAdaptiveDecision.createMany({ data: decisions });

    this.logger.log(
      `[AdaptiveRanking] stored ${decisions.length} decisions`,
    );
  }

  // ── Query helpers（Controller から呼び出す） ─────────────────────────────

  async getRanking(filter?: { symbol?: string; timeframe?: string }) {
    // 最新の決定のみ取得（pluginKey ごとに最新1件）
    const all = await this.prisma.pluginAdaptiveDecision.findMany({
      where: {
        ...(filter?.symbol    ? { symbol: filter.symbol }       : {}),
        ...(filter?.timeframe ? { timeframe: filter.timeframe } : {}),
      },
      orderBy: { decidedAt: 'desc' },
    });

    // pluginKey ごとに最新1件に絞り込み
    const seen  = new Set<string>();
    const latest = all.filter((d) => {
      if (seen.has(d.pluginKey)) return false;
      seen.add(d.pluginKey);
      return true;
    });

    // reliability と JOIN して sampleSize / state を付加
    const reliabilityMap = await this._reliabilityMap();

    return latest
      .sort((a, b) => a.rankPosition - b.rankPosition)
      .map((d) => {
        const rel = reliabilityMap.get(d.pluginKey);
        return {
          pluginKey:        d.pluginKey,
          symbol:           d.symbol,
          timeframe:        d.timeframe,
          globalScore:      d.globalScore,
          contextualScore:  d.contextualScore,
          finalRankScore:   d.finalRankScore,
          rankPosition:     d.rankPosition,
          action:           d.action,
          state:            rel?.state ?? 'active',
          reliabilityScore: rel?.reliabilityScore ?? 0,
          sampleSize:       rel?.sampleSize ?? 0,
          decidedAt:        d.decidedAt.toISOString(),
        };
      });
  }

  async getStopCandidates() {
    const reliabilities = await this.prisma.pluginReliability.findMany({
      where: {
        OR: [
          { state: 'stop_candidate' },
          { AND: [{ reliabilityScore: { lt: 0.30 } }, { sampleSize: { gte: 100 } }] },
        ],
      },
      orderBy: { reliabilityScore: 'asc' },
    });

    const decisionMap = await this._latestDecisionMap();

    return reliabilities.map((rel) => {
      const decision = decisionMap.get(rel.pluginKey);
      return {
        pluginKey:        rel.pluginKey,
        reliabilityScore: rel.reliabilityScore,
        sampleSize:       rel.sampleSize,
        state:            rel.state as 'stop_candidate',
        action:           decision?.action ?? 'stop_candidate',
        decidedAt:        (decision?.decidedAt ?? rel.updatedAt).toISOString(),
      };
    });
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  private _actionFromState(state: string): string {
    switch (state) {
      case 'active':         return 'keep';
      case 'demoted':        return 'demote';
      case 'suppressed':     return 'suppress';
      case 'stop_candidate': return 'stop_candidate';
      default:               return 'keep';
    }
  }

  private async _reliabilityMap(): Promise<Map<string, { state: string; reliabilityScore: number; sampleSize: number }>> {
    const rows = await this.prisma.pluginReliability.findMany();
    return new Map(rows.map((r) => [r.pluginKey, r]));
  }

  private async _latestDecisionMap(): Promise<Map<string, { action: string; decidedAt: Date }>> {
    const all = await this.prisma.pluginAdaptiveDecision.findMany({
      orderBy: { decidedAt: 'desc' },
    });
    const map = new Map<string, { action: string; decidedAt: Date }>();
    for (const d of all) {
      if (!map.has(d.pluginKey)) {
        map.set(d.pluginKey, { action: d.action, decidedAt: d.decidedAt });
      }
    }
    return map;
  }
}