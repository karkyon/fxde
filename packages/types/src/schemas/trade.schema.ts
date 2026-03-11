// packages/types/src/schemas/trade.schema.ts
import { z } from 'zod';

export const CreateTradeSchema = z.object({
  symbol:     z.string().min(1),
  side:       z.enum(['BUY', 'SELL']),
  entryTime:  z.string().datetime(),
  entryPrice: z.number().positive(),
  size:       z.number().positive().max(100),
  sl:         z.number().positive().optional(),
  tp:         z.number().positive().optional(),
  tags:       z.array(z.string()).optional(),
  note:       z.string().max(1000).optional(),
});

export const UpdateTradeSchema = z.object({
  sl:   z.number().positive().optional(),
  tp:   z.number().positive().optional(),
  tags: z.array(z.string()).optional(),
  note: z.string().max(1000).optional(),
});

export const CloseTradeSchema = z.object({
  exitTime:  z.string().datetime(),
  exitPrice: z.number().positive(),
  pnl:       z.number().optional(),
  pips:      z.number().optional(),
});

export const GetTradesQuerySchema = z.object({
  page:      z.coerce.number().int().min(1).default(1),
  limit:     z.coerce.number().int().min(1).max(100).default(20),
  symbol:    z.string().optional(),
  status:    z.enum(['OPEN', 'CLOSED', 'CANCELED']).optional(),
  side:      z.enum(['BUY', 'SELL']).optional(),
  from:      z.string().datetime().optional(),
  to:        z.string().datetime().optional(),
  sortBy:    z.enum(['entryTime', 'pnl', 'createdAt']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  include:   z.enum(['review']).optional(),   // ← Part 7 §1.5 TradeLogEntry 対応
});

export const RuleChecksSchema = z.object({
  scoreOk:    z.boolean(),
  riskOk:     z.boolean(),
  eventLock:  z.boolean(),
  cooldown:   z.boolean(),
  patterns:   z.array(z.string()),
  entryState: z.enum(['ENTRY_OK', 'SCORE_LOW', 'RISK_NG', 'LOCKED', 'COOLDOWN']),
});

export const PsychologySchema = z.object({
  emotion:      z.string().max(50).optional(),
  selfNote:     z.string().max(500).optional(),
  biasDetected: z.array(z.string()).optional(),
});

export const CreateTradeReviewSchema = z.object({
  scoreAtEntry: z.number().int().min(0).max(100),
  ruleChecks:   RuleChecksSchema,
  psychology:   PsychologySchema.optional(),
  disciplined:  z.boolean(),
});

export type CreateTradeInput       = z.infer<typeof CreateTradeSchema>;
export type UpdateTradeInput       = z.infer<typeof UpdateTradeSchema>;
export type CloseTradeInput        = z.infer<typeof CloseTradeSchema>;
export type GetTradesQueryInput    = z.infer<typeof GetTradesQuerySchema>;
export type CreateTradeReviewInput = z.infer<typeof CreateTradeReviewSchema>;