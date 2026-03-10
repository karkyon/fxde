// packages/types/src/schemas/settings.schema.ts
import { z } from 'zod';

export const RiskProfileSchema = z.object({
  maxRiskPct:      z.number().min(0.1).max(5.0).optional(),
  maxDailyLossPct: z.number().min(0.5).max(20.0).optional(),
  maxStreak:       z.number().int().min(1).max(10).optional(),
  cooldownMin:     z.number().int().min(5).max(480).optional(),
  maxTrades:       z.number().int().min(1).max(20).optional(),
  atrMultiplier:   z.number().min(0.5).max(5.0).optional(),
});

export const UiPrefsSchema = z.object({
  theme:            z.enum(['dark', 'light']).optional(),
  mode:             z.enum(['beginner', 'pro']).optional(),
  defaultSymbol:    z.string().optional(),
  defaultTimeframe: z.string().optional(),
});

export const FeatureSwitchesSchema = z.object({
  aiSignal:      z.boolean().optional(),
  patternBonus:  z.boolean().optional(),
  newsLock:      z.boolean().optional(),
  cooldownTimer: z.boolean().optional(),
  mtfPrediction: z.boolean().optional(),
});

export const UpdateSettingsSchema = z.object({
  preset:          z.enum(['conservative', 'standard', 'aggressive']).optional(),
  scoreThreshold:  z.number().int().min(50).max(95).optional(),
  riskProfile:     RiskProfileSchema.optional(),
  uiPrefs:         UiPrefsSchema.optional(),
  featureSwitches: FeatureSwitchesSchema.optional(),
  forceLock:       z.boolean().optional(),
});

export const ApplyPresetSchema = z.object({
  preset: z.enum(['conservative', 'standard', 'aggressive']),
});

export type UpdateSettingsDto = z.infer<typeof UpdateSettingsSchema>;
export type ApplyPresetDto    = z.infer<typeof ApplyPresetSchema>;