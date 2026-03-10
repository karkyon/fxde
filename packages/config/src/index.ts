// ============================================================
// FXDE v5.1 — Shared Configuration
// ============================================================

export const API_PREFIX = '/api/v1';

export const USER_ROLES = ['FREE', 'BASIC', 'PRO', 'PRO_PLUS', 'ADMIN'] as const;

export const ROLE_HIERARCHY: Record<string, number> = {
  FREE: 0,
  BASIC: 1,
  PRO: 2,
  PRO_PLUS: 3,
  ADMIN: 99,
};

export const TIMEFRAMES = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1'] as const;
export type Timeframe = (typeof TIMEFRAMES)[number];

export const DEFAULT_PAGINATION = {
  page: 1,
  limit: 20,
  maxLimit: 100,
};

export const DEFAULT_TIMEZONE = 'UTC';
