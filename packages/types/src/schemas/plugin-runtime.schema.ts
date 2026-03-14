/**
 * packages/types/src/schemas/plugin-runtime.schema.ts
 *
 * FXDE Plugin Runtime — 型定義正本
 *
 * 参照仕様:
 *   fxde_plugin_runtime_完全設計書 §6「Runtime 出力契約」
 *   fxde_plugin_runtime_完全設計書 §7「API 契約」
 *
 * このファイルが Plugin Runtime の API レスポンス・Frontend の型契約正本。
 * API / Service / React コンポーネントは必ずここから import すること。
 *
 * ⚠️ 描画コード（JSX/HTML/SVG断片）は一切含まない。
 *    Plugin は標準化されたデータのみを返す。
 */

import { z } from 'zod';

// ──────────────────────────────────────────────────────────────────────────
// Query Schema
// ──────────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/plugins-runtime/chart クエリパラメータ
 */
export const GetChartPluginRuntimeQuerySchema = z.object({
  symbol:    z.string().min(1).max(20),
  timeframe: z.string().min(1).max(10),
});

export type GetChartPluginRuntimeQuery = z.infer<typeof GetChartPluginRuntimeQuerySchema>;

// ──────────────────────────────────────────────────────────────────────────
// Plugin Execution Status
// ──────────────────────────────────────────────────────────────────────────

export const RuntimePluginExecutionStatusSchema = z.enum([
  'SUCCEEDED',
  'FAILED',
  'TIMEOUT',
  'SKIPPED',
]);

export type RuntimePluginExecutionStatus = z.infer<typeof RuntimePluginExecutionStatusSchema>;

export const RuntimePluginStatusSchema = z.object({
  pluginId:    z.string(),
  pluginKey:   z.string(),
  displayName: z.string(),
  status:      RuntimePluginExecutionStatusSchema,
  durationMs:  z.number(),
  errorMessage: z.string().nullable(),
  capabilities: z.array(z.string()),
});

export type RuntimePluginStatus = z.infer<typeof RuntimePluginStatusSchema>;

// ──────────────────────────────────────────────────────────────────────────
// Overlay
// ──────────────────────────────────────────────────────────────────────────

export const RuntimeOverlayKindSchema = z.enum([
  'zone',
  'line',
  'band',
  'box',
  'path',
  'marker',
]);

export type RuntimeOverlayKind = z.infer<typeof RuntimeOverlayKindSchema>;

export const RuntimeOverlayStyleSchema = z.object({
  color:      z.string().optional(),
  lineStyle:  z.enum(['solid', 'dashed', 'dotted']).optional(),
  lineWidth:  z.number().optional(),
  fillColor:  z.string().optional(),
  opacity:    z.number().min(0).max(1).optional(),
});

export const RuntimeOverlaySchema = z.object({
  id:        z.string(),
  pluginKey: z.string(),
  kind:      RuntimeOverlayKindSchema,
  label:     z.string(),
  visible:   z.boolean(),
  priority:  z.number(),
  style:     RuntimeOverlayStyleSchema.optional(),
  geometry:  z.record(z.unknown()),
  meta:      z.record(z.unknown()).optional(),
});

export type RuntimeOverlay = z.infer<typeof RuntimeOverlaySchema>;

// ── Zone Overlay（Supply Demand Zones PRO 専用）────────────────────────────

export const ZoneTypeSchema = z.enum(['supply', 'demand']);
export type ZoneType = z.infer<typeof ZoneTypeSchema>;

export const ZoneOverlayGeometrySchema = z.object({
  zoneType: ZoneTypeSchema,
  fromTime: z.string().nullable(),
  toTime:   z.string().nullable(),
  upper:    z.number(),
  lower:    z.number(),
});

export type ZoneOverlayGeometry = z.infer<typeof ZoneOverlayGeometrySchema>;

// SupplyDemandZoneOverlay = RuntimeOverlay の kind='zone' + geometry=ZoneOverlayGeometry
export const SupplyDemandZoneOverlaySchema = RuntimeOverlaySchema.extend({
  kind:     z.literal('zone'),
  geometry: ZoneOverlayGeometrySchema,
});

export type SupplyDemandZoneOverlay = z.infer<typeof SupplyDemandZoneOverlaySchema>;

// ──────────────────────────────────────────────────────────────────────────
// Signal
// ──────────────────────────────────────────────────────────────────────────

export const RuntimeSignalDirectionSchema = z.enum(['BUY', 'SELL', 'NEUTRAL']);
export type RuntimeSignalDirection = z.infer<typeof RuntimeSignalDirectionSchema>;

export const RuntimeSignalSchema = z.object({
  id:         z.string(),
  pluginKey:  z.string(),
  label:      z.string(),
  direction:  RuntimeSignalDirectionSchema,
  confidence: z.number().min(0).max(1).nullable(),
  timestamp:  z.string().nullable(),
  price:      z.number().nullable(),
  meta:       z.record(z.unknown()).optional(),
});

export type RuntimeSignal = z.infer<typeof RuntimeSignalSchema>;

// ──────────────────────────────────────────────────────────────────────────
// Indicator
// ──────────────────────────────────────────────────────────────────────────

export const RuntimeIndicatorStatusSchema = z.enum([
  'bullish',
  'bearish',
  'neutral',
  'info',
]);

export const RuntimeIndicatorSchema = z.object({
  id:        z.string(),
  pluginKey: z.string(),
  label:     z.string(),
  value:     z.union([z.string(), z.number(), z.boolean(), z.null()]),
  status:    RuntimeIndicatorStatusSchema,
  meta:      z.record(z.unknown()).optional(),
});

export type RuntimeIndicator = z.infer<typeof RuntimeIndicatorSchema>;

// ──────────────────────────────────────────────────────────────────────────
// API レスポンス上位形
// ──────────────────────────────────────────────────────────────────────────

export const ChartPluginRuntimeResponseSchema = z.object({
  symbol:        z.string(),
  timeframe:     z.string(),
  generatedAt:   z.string(),
  overlays:      z.array(RuntimeOverlaySchema),
  signals:       z.array(RuntimeSignalSchema),
  indicators:    z.array(RuntimeIndicatorSchema),
  pluginStatuses: z.array(RuntimePluginStatusSchema),
});

export type ChartPluginRuntimeResponse = z.infer<typeof ChartPluginRuntimeResponseSchema>;

// ──────────────────────────────────────────────────────────────────────────
// Plugin Capabilities（runtime 判定用定数）
// ──────────────────────────────────────────────────────────────────────────

/**
 * Chart Runtime 実行対象 capability
 * capabilities[] にこれらのいずれかを持つ plugin が chart runtime 対象となる
 */
export const CHART_RUNTIME_CAPABILITIES = [
  'chart_overlay',
  'chart_signal',
  'chart_indicator',
] as const;

export type ChartRuntimeCapability = typeof CHART_RUNTIME_CAPABILITIES[number];