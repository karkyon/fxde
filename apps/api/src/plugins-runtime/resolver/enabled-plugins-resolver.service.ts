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
 * タスクE: capability 命名差（chart.overlay vs chart_overlay）を
 *   normalizeCapability() で吸収する。DB の既存値は変更しない。
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CHART_RUNTIME_CAPABILITIES } from '@fxde/types';
import { normalizeCapabilities } from '../capability-alias.util';
import type { ResolvedPlugin } from '../types/resolved-plugin';

/** plugin ごとのデフォルト timeout ms */
const DEFAULT_TIMEOUT_MS = 2000;

@Injectable()
export class EnabledPluginsResolverService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * chart runtime 実行対象のプラグインを解決する。
   *
   * @param symbol    通貨ペア（将来拡張: plugin ごとに symbol 対応フィルタ可能）
   * @param timeframe 時間足（将来拡張: plugin ごとに timeframe フィルタ可能）
   */
  async resolve(symbol: string, timeframe: string): Promise<ResolvedPlugin[]> {
    // 有効化済みプラグインを DB から取得
    const rows = await this.prisma.pluginManifest.findMany({
      where: {
        installedPlugins: {
          some: {
            isEnabled: true,
          },
        },
        // incompatible / missing_dependency は除外
        NOT: {
          installedPlugins: {
            some: {
              status: { in: ['incompatible', 'missing_dependency'] },
            },
          },
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
      // capabilitiesJson を string[] として取得
      const rawCapabilities: string[] = Array.isArray(row.capabilitiesJson)
        ? (row.capabilitiesJson as string[])
        : [];

      // タスクE: ドット/アンダースコア両系統を正規化して比較
      const normalizedCapabilities = normalizeCapabilities(rawCapabilities);

      // chart runtime capability チェック（正規化後の値で判定）
      const hasChartCapability = normalizedCapabilities.some((c) =>
        chartCapabilities.includes(c),
      );

      if (!hasChartCapability) continue;

      resolved.push({
        pluginId:     row.id,
        pluginKey:    row.slug,
        displayName:  row.displayName,
        // 正規化済み capabilities を使用（downstream で一貫した形式が使える）
        capabilities: normalizedCapabilities,
        timeoutMs:    DEFAULT_TIMEOUT_MS,
        sortOrder:    index,
      });
    }

    // sortOrder 昇順で返す（v1 は DB 取得順）
    return resolved.sort((a, b) => a.sortOrder - b.sortOrder);
  }
}