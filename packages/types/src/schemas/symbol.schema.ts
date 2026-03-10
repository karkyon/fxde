// packages/types/src/schemas/symbol.schema.ts
import { z } from 'zod';

export const UpdateSymbolSettingSchema = z.object({
  enabled:          z.boolean().optional(),
  defaultTimeframe: z.string().optional(),
  customThreshold:  z.number().int().min(50).max(100).nullable().optional(),
});

export type UpdateSymbolSettingDto = z.infer<typeof UpdateSymbolSettingSchema>;