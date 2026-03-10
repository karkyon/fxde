// packages/types/src/enums.ts

export enum UserRole {
  FREE = 'FREE',
  BASIC = 'BASIC',
  PRO = 'PRO',
  PRO_PLUS = 'PRO_PLUS',
  ADMIN = 'ADMIN',
}

export enum TradeDirection {
  LONG = 'LONG',
  SHORT = 'SHORT',
}

export enum TradeStatus {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
}

export enum PredictionStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
}

export enum Timeframe {
  M1  = 'M1',
  M5  = 'M5',
  M15 = 'M15',
  M30 = 'M30',
  H1  = 'H1',
  H4  = 'H4',
  H8  = 'H8',
  D1  = 'D1',
  W1  = 'W1',
  MN  = 'MN',
}

export enum EntryState {
  ENTRY_OK   = 'ENTRY_OK',
  SCORE_LOW  = 'SCORE_LOW',
  RISK_NG    = 'RISK_NG',
  LOCKED     = 'LOCKED',
  COOLDOWN   = 'COOLDOWN',
}

export enum ScoreBand {
  LOW  = 'LOW',   // 0–49
  MID  = 'MID',   // 50–74
  HIGH = 'HIGH',  // 75–100
}