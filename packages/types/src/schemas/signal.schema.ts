/**
 * packages/types/src/schemas/signal.schema.ts
 *
 * 変更理由:
 *   signals DTO が class-validator を使っていたため nestjs-zod 移行に必要。
 *   Signals の入力バリデーションを Zod Schema に集約する。
 *
 * 参照仕様: SPEC_v51_part3 §9「Signals API」
 *           SPEC_v51_part1「Zod / DTO 主従ルール」
 */

import { z } from 'zod';

export const GetSignalsQuerySchema = z.object({
  page:               z.coerce.number().int().min(1).default(1),
  limit:              z.coerce.number().int().min(1).max(100).default(20),
  unacknowledgedOnly: z.coerce.boolean().optional(),
  type:               z.string().optional(),
  symbol:             z.string().optional(),
  timeframe:          z.string().optional(),
  from:               z.string().datetime().optional(),
  to:                 z.string().datetime().optional(),
});

export const GetSignalsLatestQuerySchema = z.object({
  symbol:    z.string().optional(),
  timeframe: z.string().optional(),
});

export type GetSignalsQuery       = z.infer<typeof GetSignalsQuerySchema>;
export type GetSignalsLatestQuery = z.infer<typeof GetSignalsLatestQuerySchema>;