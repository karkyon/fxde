// packages/types/src/schemas/prediction.schema.ts
import { z } from 'zod';

export const TIMEFRAME_VALUES = [
  'M1','M5','M15','M30','H1','H4','H8','D1','W1','MN',
] as const;

export const CreatePredictionJobSchema = z.object({
  symbol:    z.string().min(1),
  timeframe: z.enum(TIMEFRAME_VALUES),
});

export type CreatePredictionJobInput = z.infer<typeof CreatePredictionJobSchema>;