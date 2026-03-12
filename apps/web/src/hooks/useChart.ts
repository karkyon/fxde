/**
 * apps/web/src/hooks/useChart.ts
 *
 * PG-07 Chart ページ用 TanStack Query フック群（6本）
 *
 * 参照仕様:
 *   SPEC_v51_part11 §8.3「フロント実装のデータフロー」
 *   SPEC_v51_part11 §8.4「TanStack Query ポーリング設定」
 *   SPEC_v51_part10 §10.5〜§10.12「各セクション仕様」
 *
 * ポーリング間隔（SPEC_v51_part11 §8.4 準拠）:
 *   useChartMeta:              30秒
 *   useChartCandles:           H1以下: 5分 / H4以上: 15分
 *   useChartIndicators:        H1以下: 5分 / H4以上: 15分
 *   useChartTrades:            10秒
 *   useChartPatternMarkers:    5分
 *   useChartPredictionOverlay: なし（手動 refetch のみ）
 */

import { useQuery } from '@tanstack/react-query';
import {
  chartApi,
  type ChartMetaResponse,
  type ChartCandlesResponse,
  type ChartIndicatorsResponse,
  type ChartTradesResponse,
  type ChartPatternMarkersResponse,
  type ChartPredictionOverlayResponse,
} from '../lib/api';
import type { Timeframe } from '@fxde/types';

// ── 定数 ─────────────────────────────────────────────────────────────────────
// H4 以上の時間足（15分ポーリング）
const HIGH_TIMEFRAMES: Timeframe[] = ['H4', 'H8', 'D1', 'W1', 'MN'];

function candleRefetchMs(tf: Timeframe): number {
  return HIGH_TIMEFRAMES.includes(tf) ? 15 * 60_000 : 5 * 60_000;
}

// ── Query Keys ────────────────────────────────────────────────────────────────
export const chartKeys = {
  all:               ()                                          => ['chart'] as const,
  meta:              (symbol: string, tf: Timeframe)             => ['chart', 'meta', symbol, tf] as const,
  candles:           (symbol: string, tf: Timeframe, limit?: number) => ['chart', 'candles', symbol, tf, limit] as const,
  indicators:        (symbol: string, tf: Timeframe)             => ['chart', 'indicators', symbol, tf] as const,
  trades:            (symbol: string)                            => ['chart', 'trades', symbol] as const,
  patternMarkers:    (symbol: string, tf: Timeframe)             => ['chart', 'patterns', symbol, tf] as const,
  predictionOverlay: (symbol: string, tf: Timeframe)             => ['chart', 'prediction', symbol, tf] as const,
};

/**
 * useChartMeta
 * GET /api/v1/chart/meta
 * chart-overview セクションへのデータソース
 * ポーリング: 30秒
 */
export function useChartMeta(symbol: string, timeframe: Timeframe) {
  return useQuery<ChartMetaResponse>({
    queryKey:        chartKeys.meta(symbol, timeframe),
    queryFn:         () => chartApi.meta({ symbol, timeframe }),
    enabled:         !!symbol && !!timeframe,
    refetchInterval: 30_000,
    retry:           false,
  });
}

/**
 * useChartCandles
 * GET /api/v1/chart/candles
 * main-chart セクションへのデータソース
 * ポーリング: H1以下 5分 / H4以上 15分
 */
export function useChartCandles(symbol: string, timeframe: Timeframe, limit = 100) {
  return useQuery<ChartCandlesResponse>({
    queryKey:        chartKeys.candles(symbol, timeframe, limit),
    queryFn:         () => chartApi.candles({ symbol, timeframe, limit }),
    enabled:         !!symbol && !!timeframe,
    refetchInterval: candleRefetchMs(timeframe),
    retry:           false,
  });
}

/**
 * useChartIndicators
 * GET /api/v1/chart/indicators
 * indicator-summary セクション（6カード）へのデータソース
 * ポーリング: H1以下 5分 / H4以上 15分
 */
export function useChartIndicators(symbol: string, timeframe: Timeframe) {
  return useQuery<ChartIndicatorsResponse>({
    queryKey:        chartKeys.indicators(symbol, timeframe),
    queryFn:         () => chartApi.indicators({ symbol, timeframe }),
    enabled:         !!symbol && !!timeframe,
    refetchInterval: candleRefetchMs(timeframe),
    retry:           false,
  });
}

/**
 * useChartTrades
 * GET /api/v1/chart/trades
 * trade-overlay-panel セクションへのデータソース
 * ポーリング: 10秒
 */
export function useChartTrades(symbol: string) {
  return useQuery<ChartTradesResponse>({
    queryKey:        chartKeys.trades(symbol),
    queryFn:         () => chartApi.trades({ symbol }),
    enabled:         !!symbol,
    refetchInterval: 10_000,
    retry:           false,
  });
}

/**
 * useChartPatternMarkers
 * GET /api/v1/chart/pattern-markers
 * main-chart overlay のパターンラベルへのデータソース
 * ポーリング: 5分
 */
export function useChartPatternMarkers(symbol: string, timeframe: Timeframe, limit = 20) {
  return useQuery<ChartPatternMarkersResponse>({
    queryKey:        chartKeys.patternMarkers(symbol, timeframe),
    queryFn:         () => chartApi.patternMarkers({ symbol, timeframe, limit }),
    enabled:         !!symbol && !!timeframe,
    refetchInterval: 5 * 60_000,
    retry:           false,
  });
}

/**
 * useChartPredictionOverlay
 * GET /api/v1/chart/prediction-overlay
 * prediction-overlay-panel セクションへのデータソース
 * 権限: PRO | PRO_PLUS | ADMIN のみ（403 → ロック状態 UI）
 * ポーリング: なし（stub 固定値のため）
 */
export function useChartPredictionOverlay(symbol: string, timeframe: Timeframe, enabled = true) {
  return useQuery<ChartPredictionOverlayResponse>({
    queryKey:        chartKeys.predictionOverlay(symbol, timeframe),
    queryFn:         () => chartApi.predictionOverlay({ symbol, timeframe }),
    enabled:         !!symbol && !!timeframe && enabled,
    refetchInterval: false,   // stub 固定値。手動 refetch のみ。
    retry:           false,   // 403 時はリトライしない
  });
}