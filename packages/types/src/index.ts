// ============================================================
// FXDE v5.1 — Shared TypeScript Types
// Source of truth: prisma/schema.prisma
// DO NOT add fields that do not exist in the schema.
// ============================================================

// ─── Enums ───────────────────────────────────────────────────
export type UserRole = 'FREE' | 'BASIC' | 'PRO' | 'PRO_PLUS' | 'ADMIN';

export type TradeDirection = 'LONG' | 'SHORT';

export type TradeStatus = 'OPEN' | 'CLOSED';

export type PredictionStatus = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';

// ─── API Envelope ─────────────────────────────────────────────
export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

// ─── Pagination ───────────────────────────────────────────────
export interface PaginatedData<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

// ─── User ─────────────────────────────────────────────────────
export interface User {
  id: string;
  email: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

// ─── Settings ─────────────────────────────────────────────────
export interface Settings {
  id: string;
  userId: string;
  timezone: string;
  riskLimit: number | null;
  createdAt: string;
}

// ─── Symbol ───────────────────────────────────────────────────
export interface Symbol {
  id: string;
  name: string;
  base: string;
  quote: string;
  createdAt: string;
}

// ─── Trade ────────────────────────────────────────────────────
export interface Trade {
  id: string;
  userId: string;
  symbolId: string;
  direction: TradeDirection;
  entryPrice: number;
  exitPrice: number | null;
  volume: number;
  entryTime: string;
  exitTime: string | null;
  status: TradeStatus;
  profit: number | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  symbol?: Symbol;
  reviews?: TradeReview[];
}

// ─── Trade Review ─────────────────────────────────────────────
export interface TradeReview {
  id: string;
  tradeId: string;
  emotion: string | null;
  reason: string | null;
  lesson: string | null;
  createdAt: string;
}

// ─── Snapshot ─────────────────────────────────────────────────
export interface Snapshot {
  id: string;
  userId: string;
  metric: string;
  value: number;
  createdAt: string;
}

// ─── Signal ───────────────────────────────────────────────────
export interface Signal {
  id: string;
  symbolId: string;
  type: string;
  confidence: number;
  createdAt: string;
}

// ─── Connector ────────────────────────────────────────────────
export interface Connector {
  id: string;
  name: string;
  status: string;
  updatedAt: string;
}

// ─── Prediction ───────────────────────────────────────────────
export interface PredictionJob {
  id: string;
  userId: string;
  symbolId: string;
  timeframe: string;
  status: PredictionStatus;
  createdAt: string;
  results?: PredictionResult[];
}

/** v5.1 stub — resultData shape is fixed */
export interface PredictionResultData {
  scenarios: Record<string, unknown>;
  stats: Record<string, unknown>;
  tfWeights: null;
  hmmState: null;
}

export interface PredictionResult {
  id: string;
  jobId: string;
  resultData: PredictionResultData;
  createdAt: string;
}

// ─── Chart ────────────────────────────────────────────────────
export interface MarketCandle {
  id: string;
  symbolId: string;
  timeframe: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  time: string;
}

export interface IndicatorCache {
  id: string;
  symbolId: string;
  timeframe: string;
  indicator: string;
  data: Record<string, unknown>;
  createdAt: string;
}

export interface PatternDetection {
  id: string;
  symbolId: string;
  timeframe: string;
  pattern: string;
  confidence: number;
  detectedAt: string;
}

export interface ChartSnapshot {
  id: string;
  symbolId: string;
  timeframe: string;
  imageUrl: string;
  createdAt: string;
}

// ─── Auth ─────────────────────────────────────────────────────
export interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
}

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}
