import { z } from 'zod';

// ── Enums ──────────────────────────────────────────────────────────────────

export const TimeframeSchema = z.enum([
  'M1', 'M5', 'M15', 'M30',
  'H1', 'H4', 'H8',
  'D1', 'W1', 'MN',
]);
export type Timeframe = z.infer<typeof TimeframeSchema>;

export const EntryStateSchema = z.enum([
  'ENTRY_OK',
  'SCORE_LOW',
  'RISK_NG',
  'LOCKED',
  'COOLDOWN',
]);
export type EntryState = z.infer<typeof EntryStateSchema>;

// ── Snapshot sub-structures ────────────────────────────────────────────────

export const ScoreBreakdownSchema = z.object({
  technical:    z.number(),
  fundamental:  z.number(),
  market:       z.number(),
  rr:           z.number(),
  patternBonus: z.number(),
});

export const MaSchema = z.object({
  ma50:        z.number(),
  ma200:       z.number(),
  slope:       z.number(),
  crossStatus: z.enum(['GC', 'DC', 'NONE']),
});

export const RsiSchema = z.object({
  value:      z.number(),
  divergence: z.boolean(),
});

export const MacdSchema = z.object({
  macdLine:    z.number(),
  signal:      z.number(),
  histogram:   z.number(),
  crossStatus: z.enum(['GC', 'DC', 'NONE']),
});

export const BbSchema = z.object({
  upper:     z.number(),
  mid:       z.number(),
  lower:     z.number(),
  bandwidth: z.number(),
});

export const AtrSchema = z.object({
  value: z.number(),
  ratio: z.number(),
});

export const IndicatorsSchema = z.object({
  ma:   MaSchema,
  rsi:  RsiSchema,
  macd: MacdSchema,
  bb:   BbSchema,
  atr:  AtrSchema,
});

export const PatternItemSchema = z.object({
  name:       z.string(),
  direction:  z.enum(['BUY', 'SELL']),
  confidence: z.number(),
  bonus:      z.number(),
});

export const MtfDirectionSchema = z.enum(['BUY', 'SELL', 'NEUTRAL']);

export const MtfAlignmentItemSchema = z.object({
  score:     z.number(),
  direction: MtfDirectionSchema,
});

export const MtfAlignmentSchema = z.record(MtfAlignmentItemSchema);

export const EntryContextSchema = z.object({
  rr:            z.number(),
  lotSize:       z.number(),
  isEventWindow: z.boolean(),
  isCooldown:    z.boolean(),
  forceLock:     z.boolean(),
});

// ── GET /snapshots クエリ ──────────────────────────────────────────────────

export const GetSnapshotsQuerySchema = z.object({
  symbol:     z.string().optional(),
  timeframe:  TimeframeSchema.optional(),
  entryState: EntryStateSchema.optional(),
  from:       z.string().datetime().optional(),
  to:         z.string().datetime().optional(),
  page:       z.coerce.number().int().min(1).default(1),
  limit:      z.coerce.number().int().min(1).max(100).default(20),
});
export type GetSnapshotsQuery = z.infer<typeof GetSnapshotsQuerySchema>;

// ── GET /snapshots/latest クエリ ───────────────────────────────────────────

export const GetSnapshotsLatestQuerySchema = z.object({
  symbol:    z.string().optional(),
  timeframe: TimeframeSchema.optional(),
});
export type GetSnapshotsLatestQuery = z.infer<typeof GetSnapshotsLatestQuerySchema>;

// ── POST /snapshots/capture リクエストボディ ───────────────────────────────
// 参照: SPEC_v51_part3 §7

export const CaptureSnapshotSchema = z.object({
  /** 通貨ペア（例: "EURUSD"）*/
  symbol:    z.string().min(1),
  /** 時間足 */
  timeframe: TimeframeSchema,
  /** バックテスト用途（省略時はコネクタから最新データを取得）*/
  asOf:      z.string().datetime().optional(),
});
export type CaptureSnapshotDto = z.infer<typeof CaptureSnapshotSchema>;

// ── POST /snapshots/evaluate リクエストボディ ─────────────────────────────
// 参照: SPEC_v51_part3 §7
// capture と同じ入力を受けるが、DB 保存を行わない

export const EvaluateSnapshotSchema = z.object({
  /** 通貨ペア（例: "EURUSD"）*/
  symbol:    z.string().min(1),
  /** 時間足 */
  timeframe: TimeframeSchema,
  /** バックテスト用途（省略時はコネクタから最新データを取得）*/
  asOf:      z.string().datetime().optional(),
});
export type EvaluateSnapshotDto = z.infer<typeof EvaluateSnapshotSchema>;