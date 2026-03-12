/**
 * apps/api/src/modules/predictions/dto/predictions.dto.ts
 *
 * 参照仕様:
 *   SPEC_v51_part3 §10「Predictions API」
 *   SPEC_v51_part1「Zod / DTO 主従ルール」
 *   SPEC_v51_part8 §2.3「PATCH /predictions/jobs/:id/tf-weights」
 *   SPEC_v51_part10 §6.6「予測系エンドポイント（確定）」
 *   packages/types/src/schemas/prediction.schema.ts（正本 Zod Schema）
 *
 * 規約:
 *   hand-written DTO 禁止。全て createZodDto() 派生。
 *   SPEC_v51_part3 §10 より v5.1 受付フィールドは symbol / timeframe のみ。
 *   lookbackYears / minSimilarity / topK は v6 アルゴリズムパラメータのため定義しない。
 *
 * 【修正履歴】
 *   - [Task A] UpdateTfWeightsDto を追加
 *     参照: SPEC_v51_part8 §2.3 / SPEC_v51_part10 §6.6
 */

import { createZodDto } from 'nestjs-zod';
import { z }            from 'zod';
import {
  CreatePredictionJobSchema,
  UpdateTfWeightsSchema,
} from '@fxde/types';

// ── POST /predictions/jobs ─────────────────────────────────────────────────
// v5.1: symbol / timeframe のみ受付
// 参照: SPEC_v51_part3 §10
export class CreatePredictionJobDto extends createZodDto(CreatePredictionJobSchema) {}

// ── GET /predictions/latest クエリ ──────────────────────────────────────────
// symbol（必須）/ timeframe（任意）
// 参照: SPEC_v51_part10 §6.6
//   > GET /predictions/latest?symbol={symbol}&timeframe={tf}
//   > symbol（必須）/ timeframe（任意 例: H1）
export const GetPredictionLatestQuerySchema = z.object({
  symbol:    z.string().min(1),
  timeframe: z.string().optional(),
});

export class GetPredictionLatestQueryDto extends createZodDto(GetPredictionLatestQuerySchema) {}

// ── PATCH /predictions/jobs/:id/tf-weights ─────────────────────────────────
// [Task A] TF 重みの上書き保存
// 参照: SPEC_v51_part8 §2.3 / SPEC_v51_part10 §6.6
// Zod 正本: packages/types/src/schemas/prediction.schema.ts (UpdateTfWeightsSchema)
export class UpdateTfWeightsDto extends createZodDto(UpdateTfWeightsSchema) {}