// apps/api/src/modules/settings/preset.constants.ts
import type { Preset } from '@prisma/client';

type RiskProfileDefaults = {
  maxRiskPct:      number;
  maxDailyLossPct: number;
  maxStreak:       number;
  cooldownMin:     number;
  maxTrades:       number;
  atrMultiplier:   number;
};

/**
 * プリセット別リスクプロファイル初期値
 * 仕様: SPEC_v51_part3 §5
 */
export const PRESET_DEFAULTS: Record<Preset, RiskProfileDefaults> = {
  conservative: {
    maxRiskPct:      0.5,
    maxDailyLossPct: 1.5,
    maxStreak:       2,
    cooldownMin:     60,
    maxTrades:       2,
    atrMultiplier:   1.5,
  },
  standard: {
    maxRiskPct:      1.0,
    maxDailyLossPct: 3.0,
    maxStreak:       3,
    cooldownMin:     30,
    maxTrades:       3,
    atrMultiplier:   1.5,
  },
  aggressive: {
    maxRiskPct:      2.0,
    maxDailyLossPct: 6.0,
    maxStreak:       5,
    cooldownMin:     15,
    maxTrades:       5,
    atrMultiplier:   2.0,
  },
};

/**
 * プリセット別 scoreThreshold 初期値
 * 仕様: SPEC_v51_part3 §5
 */
export const PRESET_THRESHOLDS: Record<Preset, number> = {
  conservative: 85,
  standard:     75,
  aggressive:   70,
};