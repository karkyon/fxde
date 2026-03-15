/**
 * apps/api/src/plugins-runtime/resolver/enabled-plugins-resolver.service.ts
 *
 * 有効化された plugin の中から chart runtime 実行対象を解決する。
 *
 * 参照仕様:
 *   fxde_plugin_runtime_完全設計書 §4.2「Enabled Plugins Resolver」
 *   fxde_plugin_runtime_完全設計書 §5「capabilities ベース設計」
 *
 * 解決ルール:
 *   - InstalledPlugin.isEnabled = true かつ status != 'incompatible' | 'missing_dependency'
 *   - capabilitiesJson に 'chart_overlay' | 'chart_signal' | 'chart_indicator' のいずれかを持つ
 *   - capability 未定義プラグインは v1 では runtime 対象外
 *   - sortOrder は id 辞書順（v1 簡易実装）
 *
 * 修正（Task A）:
 *   - AdaptiveRankingService.getSuppressedPluginKeys() を resolve() 冒頭で呼び出す。
 *   - action が 'suppress' または 'auto_stop' な pluginKey は実行対象から除外する。
 *   - PluginAdaptiveDecision が存在しない場合は空セット（全 plugin 実行許可）。
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService }          from '../../prisma/prisma.service';
import { AdaptiveRankingService } from '../../modules/plugins-ranking/service/adaptive-ranking.service';
import { CHART_RUNTIME_CAPABILITIES } from '@fxde/types';
import { normalizeCapabilities }      from '../capability-alias.util';
import type { ResolvedPlugin }        from '../types/resolved-plugin';

/** plugin ごとのデフォルト timeout ms */
const DEFAULT_TIMEOUT_MS = 2000;

@Injectable()
export class EnabledPluginsResolverService {
  private readonly logger = new Logger(EnabledPluginsResolverService.name);

  constructor(
    private readonly prisma:          PrismaService,
    private readonly adaptiveRanking: AdaptiveRankingService,  // 追加
  ) {}

  /**
   * chart runtime 実行対象のプラグインを解決する。
   *
   * @param symbol    通貨ペア
   * @param timeframe 時間足
   */
  async resolve(symbol: string, timeframe: string): Promise<ResolvedPlugin[]> {
    // 追加: suppressed / auto_stop な pluginKey を事前取得
    // PluginAdaptiveDecision が空の場合は空 Set（全 plugin 実行許可）
    const suppressedKeys = await this.adaptiveRanking.getSuppressedPluginKeys();

    const rows = await this.prisma.pluginManifest.findMany({
      where: {
        installedPlugins: {
          some: { isEnabled: true },
          none: { status: { in: ['incompatible', 'missing_dependency'] } },
        },
      },
      include: {
        installedPlugins: {
          select: {
            isEnabled: true,
            status:    true,
          },
        },
      },
      orderBy: { id: 'asc' },
    });

    // CHART_RUNTIME_CAPABILITIES は canonical（アンダースコア）形式
    const chartCapabilities = CHART_RUNTIME_CAPABILITIES as readonly string[];

    const resolved: ResolvedPlugin[] = [];

    for (const [index, row] of rows.entries()) {
      // 追加: ranking で suppress / auto_stop と判定された plugin をスキップ
      if (suppressedKeys.has(row.slug)) {
        this.logger.debug(
          `[EnabledPluginsResolver] plugin "${row.slug}" is suppressed by ranking, skip`,
        );
        continue;
      }

      const rawCapabilities: string[] = Array.isArray(row.capabilitiesJson)
        ? (row.capabilitiesJson as string[])
        : [];

      const normalizedCapabilities = normalizeCapabilities(rawCapabilities);

      const hasChartCapability = normalizedCapabilities.some((c) =>
        chartCapabilities.includes(c),
      );

      if (!hasChartCapability) continue;

      resolved.push({
        pluginId:     row.id,
        pluginKey:    row.slug,
        displayName:  row.displayName,
        capabilities: normalizedCapabilities,
        timeoutMs:    DEFAULT_TIMEOUT_MS,
        sortOrder:    index,
      });
    }

    return resolved.sort((a, b) => a.sortOrder - b.sortOrder);
  }
}