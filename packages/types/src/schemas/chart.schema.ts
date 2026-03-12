/**
 * packages/types/src/schemas/chart.schema.ts
 *
 * Chart API クエリパラメータの Zod Schema（正本）
 * 参照仕様: SPEC_v51_part11 §2.3「Zod Schema / DTO 設計規則」
 *           SPEC_v51_part11 §3「API エンドポイント詳細」
 *
 * 命名規則: ChartXxxQuerySchema / ChartXxxQuery
 * 使用元: apps/api/src/chart/dto/*.query.dto.ts（createZodDto 派生）
 */

import { z } from 'zod';
import { TimeframeSchema } from './snapshot.schema';

// ── GET /api/v1/chart/meta ─────────────────────────────────────────────────
// 参照: SPEC_v51_part11 §3.1
export const ChartMetaQuerySchema = z.object({
  symbol:    z.string().min(1).max(10),
  timeframe: TimeframeSchema,
});
export type ChartMetaQuery = z.infer<typeof ChartMetaQuerySchema>;

// ── GET /api/v1/chart/candles ──────────────────────────────────────────────
// 参照: SPEC_v51_part11 §3.2
export const ChartCandlesQuerySchema = z.object({
  symbol:    z.string().min(1).max(10),
  timeframe: TimeframeSchema,
  limit:     z.coerce.number().int().min(1).max(500).default(100),
  before:    z.string().datetime().optional(),
});
export type ChartCandlesQuery = z.infer<typeof ChartCandlesQuerySchema>;

// ── GET /api/v1/chart/indicators ───────────────────────────────────────────
// 参照: SPEC_v51_part11 §3.3
export const ChartIndicatorsQuerySchema = z.object({
  symbol:    z.string().min(1).max(10),
  timeframe: TimeframeSchema,
});
export type ChartIndicatorsQuery = z.infer<typeof ChartIndicatorsQuerySchema>;

// ── GET /api/v1/chart/trades ───────────────────────────────────────────────
// 参照: SPEC_v51_part11 §3.4
export const ChartTradesQuerySchema = z.object({
  symbol: z.string().min(1).max(10),
});
export type ChartTradesQuery = z.infer<typeof ChartTradesQuerySchema>;

// ── GET /api/v1/chart/pattern-markers ─────────────────────────────────────
// 参照: SPEC_v51_part11 §3.5
export const ChartPatternMarkersQuerySchema = z.object({
  symbol:    z.string().min(1).max(10),
  timeframe: TimeframeSchema,
  limit:     z.coerce.number().int().min(1).max(50).default(20),
});
export type ChartPatternMarkersQuery = z.infer<typeof ChartPatternMarkersQuerySchema>;

// ── GET /api/v1/chart/prediction-overlay ──────────────────────────────────
// 参照: SPEC_v51_part11 §3.6
// 権限: PRO | PRO_PLUS | ADMIN のみ（RolesGuard は controller で適用）
export const ChartPredictionOverlayQuerySchema = z.object({
  symbol:    z.string().min(1).max(10),
  timeframe: TimeframeSchema,
});
export type ChartPredictionOverlayQuery = z.infer<typeof ChartPredictionOverlayQuerySchema>;