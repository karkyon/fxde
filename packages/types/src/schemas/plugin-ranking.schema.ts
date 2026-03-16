/**
 * packages/types/src/schemas/plugin-ranking.schema.ts
 *
 * Adaptive Plugin Ranking Engine — Zod 正本
 * NestJS DTO / Web フォームはここから派生させること。
 */

import { z } from 'zod';

// ── Plugin state ─────────────────────────────────────────────────────────
export const PluginStateSchema = z.enum([
  'active',
  'demoted',
  'suppressed',
  'stop_candidate',
]);

export type PluginState = z.infer<typeof PluginStateSchema>;

// ── Reliability item ─────────────────────────────────────────────────────
export const PluginReliabilityItemSchema = z.object({
  id:               z.string(),
  pluginKey:        z.string(),
  symbol:           z.string().nullable(),
  timeframe:        z.string().nullable(),
  sampleSize:       z.number().int(),
  winRate:          z.number(),
  expectancy:       z.number(),
  avgReturn:        z.number(),
  avgMfe:           z.number(),
  avgMae:           z.number(),
  reliabilityScore: z.number(),
  stabilityScore:   z.number(),
  confidenceScore:  z.number(),
  state:            PluginStateSchema,
  updatedAt:        z.string(),
});

export type PluginReliabilityItem = z.infer<typeof PluginReliabilityItemSchema>;

export const PluginReliabilityResponseSchema = z.array(PluginReliabilityItemSchema);

// ── Ranking item ─────────────────────────────────────────────────────────
export const PluginRankingItemSchema = z.object({
  pluginKey:        z.string(),
  symbol:           z.string().nullable(),
  timeframe:        z.string().nullable(),
  globalScore:      z.number(),
  contextualScore:  z.number(),
  finalRankScore:   z.number(),
  rankPosition:     z.number().int(),
  action:           z.string(),
  state:            PluginStateSchema,
  reliabilityScore: z.number(),
  sampleSize:       z.number().int(),
  decidedAt:        z.string(),
});

export type PluginRankingItem = z.infer<typeof PluginRankingItemSchema>;

export const PluginRankingResponseSchema = z.array(PluginRankingItemSchema);

// ── Stop candidate item ─────────────────────────────────────────────────
export const PluginStopCandidateItemSchema = z.object({
  pluginKey:        z.string(),
  reliabilityScore: z.number(),
  sampleSize:       z.number().int(),
  state:            PluginStateSchema,
  action:           z.string(),
  decidedAt:        z.string(),
});

export type PluginStopCandidateItem = z.infer<typeof PluginStopCandidateItemSchema>;

export const PluginStopCandidateResponseSchema = z.array(PluginStopCandidateItemSchema);

// ── Query schemas ──────────────────────────────────────────────────────
export const GetPluginRankingQuerySchema = z.object({
  symbol:    z.string().optional(),
  timeframe: z.string().optional(),
});

export type GetPluginRankingQuery = z.infer<typeof GetPluginRankingQuerySchema>;

// ── Ranking history item（trend chart 用）────────────────────────────
export const PluginRankingHistoryItemSchema = z.object({
  finalRankScore: z.number(),
  globalScore:    z.number(),
  action:         z.string(),
  decidedAt:      z.string(),
});

export type PluginRankingHistoryItem = z.infer<typeof PluginRankingHistoryItemSchema>;