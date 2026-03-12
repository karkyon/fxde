// packages/types/src/schemas/prediction.schema.ts
//
// 変更履歴（2026-03-12）:
//   UpdateTfWeightsSchema を追加
//   PATCH /api/v1/predictions/jobs/:id/tf-weights DTO の正本 Zod Schema
//   参照: SPEC_v51_part8 §2.3 / SPEC_v51_part10 §6.6
//
import { z } from 'zod';

export const TIMEFRAME_VALUES = [
  'M1','M5','M15','M30','H1','H4','H8','D1','W1','MN',
] as const;

// ── POST /predictions/jobs ─────────────────────────────────────────────────
// v5.1: symbol / timeframe のみ受付
// 参照: SPEC_v51_part3 §10
export const CreatePredictionJobSchema = z.object({
  symbol:    z.string().min(1),
  timeframe: z.enum(TIMEFRAME_VALUES),
});

export type CreatePredictionJobInput = z.infer<typeof CreatePredictionJobSchema>;

// ── PATCH /predictions/jobs/:id/tf-weights ─────────────────────────────────
// TF 重み更新（スライダー設定保存）
// 参照: SPEC_v51_part8 §2.3 / SPEC_v51_part10 §6.6
//
// 制約（SPEC_v51_part8 §2.3）:
//   - 各重みは 0.05 〜 0.50 の範囲
//   - 合計が 1.0 になるよう正規化はサービス層で実施（バリデーション時は不問）
//   - 存在しない TF は省略可（Partial<Record<Timeframe, number>>）
export const UpdateTfWeightsSchema = z.object({
  // Partial<Record<Timeframe, number>> 相当
  // Zod では Record を z.record() で表現する
  weights: z
    .record(
      z.enum(TIMEFRAME_VALUES),
      z.number().min(0.05).max(0.50),
    )
    .refine(
      (w) => Object.keys(w).length > 0,
      { message: 'weights must contain at least one timeframe entry' },
    ),
});

export type UpdateTfWeightsInput = z.infer<typeof UpdateTfWeightsSchema>;