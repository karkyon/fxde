/**
 * apps/web/src/hooks/useChartPluginRuntime.ts
 *
 * Chart 用 Plugin Runtime フック
 *
 * 参照仕様:
 *   fxde_plugin_runtime_完全設計書 §9.1「hook 追加」
 *   fxde_plugin_runtime_完全設計書 §9.2「Chart ページ統合」
 *
 * 役割:
 *   GET /api/v1/plugins-runtime/chart を TanStack Query で呼び出す。
 *   既存 useChart.ts の 6 フックとは別ファイルに分離し、責務を明確にする。
 *
 * ポーリング:
 *   30 秒（candles/indicators より少し長め）
 *   設計書 §9.1「30秒以下で十分」に準拠。
 *
 * query key:
 *   ['chart-plugin-runtime', symbol, timeframe]
 */

import { useQuery } from '@tanstack/react-query';
import { pluginsRuntimeApi } from '../lib/api';
import type { ChartPluginRuntimeResponse } from '@fxde/types';
import type { Timeframe } from '@fxde/types';

// ── Query Keys ────────────────────────────────────────────────────────────────
export const chartPluginRuntimeKeys = {
  all:   ()                                       => ['chart-plugin-runtime'] as const,
  chart: (symbol: string, tf: Timeframe | string) =>
    ['chart-plugin-runtime', symbol, tf] as const,
};

/** ポーリング間隔: 30 秒（設計書 §9.1 準拠） */
const PLUGIN_RUNTIME_REFETCH_MS = 30_000;

/**
 * useChartPluginRuntime
 *
 * GET /api/v1/plugins-runtime/chart を呼び出し、
 * chart 上に表示するための overlay / signal / indicator / pluginStatuses を返す。
 *
 * 既存 useChartMeta / useChartCandles 等とは独立したデータソース。
 * plugin が失敗しても空配列を返す（API 設計上 200 が返ってくるため）。
 *
 * @param symbol    通貨ペア（例: 'EURUSD'）
 * @param timeframe 時間足（例: 'H1'）
 * @param enabled   false の場合はクエリを実行しない（デフォルト true）
 */
export function useChartPluginRuntime(
  symbol: string,
  timeframe: Timeframe | string,
  enabled = true,
) {
  // [DEBUG] hook 呼び出し確認
  console.log('[useChartPluginRuntime] hook called', { symbol, timeframe, enabled });

  return useQuery<ChartPluginRuntimeResponse>({
    queryKey: chartPluginRuntimeKeys.chart(symbol, timeframe),
    queryFn:  async () => {
      // [DEBUG] fetch 開始
      console.log('[useChartPluginRuntime] start', { symbol, timeframe });
      try {
        const result = await pluginsRuntimeApi.chart({ symbol, timeframe });
        // [DEBUG] 成功レスポンス全体
        console.log('[useChartPluginRuntime] success', result);
        return result;
      } catch (error) {
        // [DEBUG] 失敗レスポンス全体
        console.error('[useChartPluginRuntime] error', error);
        throw error;
      }
    },
    enabled:         !!symbol && !!timeframe && enabled,
    refetchInterval: PLUGIN_RUNTIME_REFETCH_MS,
    retry:           false,   // plugin 実行 API は再試行しない（次の poll で自然回復）
    // plugin runtime は stale でも古い overlay を表示し続けてよい
    staleTime:       PLUGIN_RUNTIME_REFETCH_MS,
  });
}