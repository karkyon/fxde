// ─── Auth ────────────────────────────────────────────────────────────────────
export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  user: User;
}

// ─── User ────────────────────────────────────────────────────────────────────
export interface User {
  id: string;
  email: string;
  name: string;
  role: 'FREE' | 'BASIC' | 'PRO' | 'PRO_PLUS' | 'ADMIN';
  createdAt: string;
  updatedAt: string;
}

// ─── Trade ───────────────────────────────────────────────────────────────────
export type TradeDirection = 'LONG' | 'SHORT';
export type TradeStatus = 'OPEN' | 'CLOSED' | 'CANCELLED';

export interface Trade {
  id: string;
  symbol: string;
  direction: TradeDirection;
  status: TradeStatus;
  entryPrice: number;
  exitPrice?: number | null;
  lotSize: number;
  stopLoss?: number | null;
  takeProfit?: number | null;
  openedAt: string;
  closedAt?: string | null;
  pnl?: number | null;
  notes?: string | null;
  strategyTag?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTradeRequest {
  symbol: string;
  direction: TradeDirection;
  entryPrice: number;
  lotSize: number;
  stopLoss?: number;
  takeProfit?: number;
  notes?: string;
  strategyTag?: string;
  openedAt?: string;
}

export interface UpdateTradeRequest {
  notes?: string;
  strategyTag?: string;
  stopLoss?: number;
  takeProfit?: number;
}

export interface CloseTradeRequest {
  exitPrice: number;
  closedAt?: string;
}

export interface TradeReview {
  id: string;
  tradeId: string;
  emotionScore: number;
  disciplineScore: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateReviewRequest {
  emotionScore: number;
  disciplineScore: number;
  notes: string;
}

// ─── Snapshot ────────────────────────────────────────────────────────────────
export interface Snapshot {
  id: string;
  date: string;
  totalPnl: number;
  winRate: number;
  tradeCount: number;
  openTradeCount: number;
  avgRr: number | null;
  createdAt: string;
}

// ─── Signal ──────────────────────────────────────────────────────────────────
export type EntryState = 'ENTRY_OK' | 'SCORE_LOW' | 'RISK_NG' | 'LOCKED' | 'COOLDOWN';
export type ScoreBand = 'HIGH' | 'MID' | 'LOW';

export interface Signal {
  id: string;
  symbol: string;
  entryState: EntryState;
  scoreBand: ScoreBand;
  score: number;
  generatedAt: string;
  createdAt: string;
}

// ─── Settings ────────────────────────────────────────────────────────────────
export interface Settings {
  id: string;
  userId: string;
  maxDailyLoss: number;
  maxWeeklyLoss: number;
  defaultLotSize: number;
  riskPerTrade: number;
  watchedSymbols: string[];
  emailNotifications: boolean;
  timezone: string;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateSettingsRequest {
  maxDailyLoss?: number;
  maxWeeklyLoss?: number;
  defaultLotSize?: number;
  riskPerTrade?: number;
  watchedSymbols?: string[];
  emailNotifications?: boolean;
  timezone?: string;
}

// ─── Symbol ──────────────────────────────────────────────────────────────────
export interface Symbol {
  id: string;
  pair: string;
  baseCurrency: string;
  quoteCurrency: string;
  isActive: boolean;
}

// ─── Pagination ──────────────────────────────────────────────────────────────
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
}