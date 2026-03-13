// packages/types/src/schemas/symbol.schema.ts
import { z } from 'zod';

export const UpdateSymbolSettingSchema = z.object({
  enabled:          z.boolean().optional(),
  defaultTimeframe: z.string().optional(),
  customThreshold:  z.number().int().min(50).max(100).nullable().optional(),
});

export type UpdateSymbolSettingDto = z.infer<typeof UpdateSymbolSettingSchema>;

/**
 * GET /api/v1/symbols/correlation クエリスキーマ
 * period: '30d' | '90d'（省略時は '30d'）
 * 参照: SPEC_v51_part3 §11 / SPEC_v51_part7 §2.4
 */
export const CorrelationQuerySchema = z.object({
  period: z.enum(['30d', '90d']).default('30d'),
});

export type CorrelationQuery = z.infer<typeof CorrelationQuerySchema>;