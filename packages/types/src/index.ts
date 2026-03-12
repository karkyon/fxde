/**
 * FXDE v5.1 — Shared TypeScript Types
 * packages/types/src/index.ts
 *
 * このファイルは prisma/schema.prisma と完全同期している。
 * DB命名: snake_case / Prisma / TypeScript命名: camelCase / PascalCase
 * Phase2確定版 - 推測カラム追加禁止
 *
 * 【修正履歴】
 *   - PaginationMeta / PaginatedResponse { items, meta } を削除（仕様誤り）
 *     正本は packages/types/src/api.ts の PaginatedResponse { data, total, page, limit }
 *   - export * from './api' を追加（PaginationQuery / PaginatedResponse を外部公開）
 *   参照: SPEC_v51_part3 §2「共通型定義」
 */

// ══════════════════════════════════════════
// ENUMS (Prisma enum と 1:1 対応)
// ══════════════════════════════════════════

export type UserRole = 'FREE' | 'BASIC' | 'PRO' | 'PRO_PLUS' | 'ADMIN'
export type UserStatus = 'ACTIVE' | 'SUSPENDED'
export type Preset = 'conservative' | 'standard' | 'aggressive'
export type TradeSide = 'BUY' | 'SELL'
export type TradeStatus = 'OPEN' | 'CLOSED' | 'CANCELED'
export type EntryState = 'ENTRY_OK' | 'SCORE_LOW' | 'RISK_NG' | 'LOCKED' | 'COOLDOWN'
export type Timeframe = 'M1' | 'M5' | 'M15' | 'M30' | 'H1' | 'H4' | 'H8' | 'D1' | 'W1' | 'MN'
export type JobStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED'

export type SignalType =
  | 'ENTRY_OK'
  | 'LOCKED_EVENT'
  | 'LOCKED_FORCE'
  | 'COOLDOWN'
  | 'BREAKOUT'
  | 'PATTERN_DETECTED'

export type ImportanceLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

// ══════════════════════════════════════════
// RBAC ヘルパー定数
// ══════════════════════════════════════════

export const ROLE_HIERARCHY: UserRole[] = ['FREE', 'BASIC', 'PRO', 'PRO_PLUS', 'ADMIN']
export const ROLES_PRO_OR_ABOVE: UserRole[] = ['PRO', 'PRO_PLUS', 'ADMIN']
export const ROLES_BASIC_OR_ABOVE: UserRole[] = ['BASIC', 'PRO', 'PRO_PLUS', 'ADMIN']
export function hasRole(userRole: UserRole, requiredRole: UserRole): boolean {
  return ROLE_HIERARCHY.indexOf(userRole) >= ROLE_HIERARCHY.indexOf(requiredRole)
}

// ══════════════════════════════════════════
// JSON フィールド型定義
// ══════════════════════════════════════════

// UserSetting.riskProfile
export interface RiskProfile {
  maxRiskPct: number
  maxDailyLossPct: number
  maxStreak: number
  cooldownMin: number
  maxTrades: number
  atrMultiplier: number
}

// UserSetting.uiPrefs
export interface UiPrefs {
  theme: 'dark' | 'light'
  mode: 'beginner' | 'pro'
  defaultSymbol: string
  defaultTimeframe: Timeframe
}

// UserSetting.featureSwitches
export interface FeatureSwitches {
  aiSignal: boolean
  patternBonus: boolean
  newsLock: boolean
  cooldownTimer: boolean
  mtfPrediction: boolean
}

// TradeReview.ruleChecks
export interface RuleChecks {
  scoreOk: boolean
  riskOk: boolean
  eventLock: boolean
  cooldown: boolean
  patterns: string[]
  entryState: EntryState
}

// TradeReview.psychology
export interface Psychology {
  emotion: string
  selfNote: string
  biasDetected: string[]
}

// Snapshot.indicators
export interface SnapshotIndicators {
  ma: {
    ma50: number
    ma200: number
    slope: number
    crossStatus: 'GC' | 'DC' | 'NONE'
  }
  rsi: {
    value: number
    divergence: boolean
  }
  macd: {
    macdLine: number
    signal: number
    histogram: number
    crossStatus: 'GC' | 'DC' | 'NONE'
  }
  bb: {
    upper: number
    mid: number
    lower: number
    bandwidth: number
  }
  atr: {
    value: number
    ratio: number
  }
}

// Snapshot.patterns (配列要素)
export interface SnapshotPattern {
  name: string
  direction: 'BUY' | 'SELL'
  confidence: number
  bonus: number
}

// Snapshot.mtfAlignment (キーは Timeframe 文字列)
export type MtfAlignment = Partial<
  Record<
    Timeframe,
    {
      score: number
      direction: 'BUY' | 'SELL' | 'NEUTRAL'
    }
  >
>

// Snapshot.scoreBreakdown
export interface ScoreBreakdown {
  technical: number
  fundamental: number
  market: number
  rr: number
  patternBonus: number
}

// Snapshot.entryContext
export interface EntryContext {
  rr: number
  lotSize: number
  isEventWindow: boolean
  isCooldown: boolean
  forceLock: boolean
}

// Signal.metadata (SignalType 別)
export type SignalMetadata =
  | { score: number; patterns: string[] }                              // ENTRY_OK
  | { eventName: string; minutesUntil: number }                        // LOCKED_EVENT
  | { patternName: string; confidence: number; bonus: number }         // PATTERN_DETECTED
  | Record<string, unknown>                                            // その他

// PredictionResult.resultData (v5.1 stub)
export interface PredictionResultData {
  scenarios: {
    bull:    { probability: 0.63, target: '+0.8%', horizonBars: 12 },
    neutral: { probability: 0.22, target: '+0.1%', horizonBars: 12 },
    bear:    { probability: 0.15, target: '-0.5%', horizonBars: 12 },
  }
  stats: {
    matchedCases: number
    confidence: number
    note: string
  }
  tfWeights: null   // v6 で本実装
  hmmState: null    // v6 で本実装
}

// v5.1 stub 固定値
export const STUB_PREDICTION_RESULT: PredictionResultData = {
  scenarios: {
    bull:    { probability: 0.63, target: '+0.8%', horizonBars: 12 },
    neutral: { probability: 0.22, target: '+0.1%', horizonBars: 12 },
    bear:    { probability: 0.15, target: '-0.5%', horizonBars: 12 },
  },
  stats: {
    matchedCases: 0,
    confidence: 0.55,
    note: 'v5.1 STUB result',
  },
  tfWeights: null,
  hmmState: null,
}

// ── [Task C] TfWeight 型（SPEC_v51_part8 §2.2 正本）────────────────────────────
/**
 * TfWeight: あるエントリー足を基準とした参照先時間足ごとの重み
 * 参照: SPEC_v51_part8 §2.2
 */
export type TfWeight = Partial<Record<Timeframe, number>>

/**
 * DEFAULT_TF_WEIGHTS: エントリー足ごとに定義された重みテーブル
 * スライダーの「デフォルトに戻す」ボタンでこの値に戻す。
 * 参照: SPEC_v51_part8 §2.2
 */
export const DEFAULT_TF_WEIGHTS: Partial<Record<Timeframe, TfWeight>> = {
  H4:  { W1: 0.30, D1: 0.25, H4: 0.20, H1: 0.15, M30: 0.10 },
  H1:  { D1: 0.30, H4: 0.25, H1: 0.20, M30: 0.15, M15: 0.10 },
  D1:  { MN: 0.15, W1: 0.30, D1: 0.25, H8: 0.15, H4: 0.15  },
  M15: { H4: 0.30, H1: 0.25, M30: 0.20, M15: 0.15, M5: 0.10 },
}

// ── [Task C] Prediction API 型（SPEC_v51_part3 §10 正本）────────────────────────
/**
 * PredictionScenario — GET /api/v1/predictions/latest レスポンス配列要素型
 * ⚠️ frontend / backend のローカル定義はすべて廃止。必ずここから import。
 * 参照: SPEC_v51_part3 §10
 */
export interface PredictionScenario {
  id:           'bull' | 'neutral' | 'bear'
  label:        string
  probability:  number
  pricePoints:  { bar: number; price: number }[]
  maxPips:      number
  avgTimeHours: number
}

/**
 * PredictionLatestResponse — GET /api/v1/predictions/latest レスポンス型
 * ⚠️ apps/web/src/lib/api.ts でのローカル定義は廃止。必ずここから import。
 * 参照: SPEC_v51_part3 §10
 */
export interface PredictionLatestResponse {
  jobId:     string
  symbol:    string
  timeframe: string
  createdAt: string
  result: {
    scenarios: PredictionScenario[]
    stub: true
  }
}

/**
 * UpdateTfWeightsInput — PATCH /predictions/jobs/:id/tf-weights リクエスト型
 * Zod バリデーション正本: packages/types/src/schemas/prediction.schema.ts
 * 参照: SPEC_v51_part8 §2.3 / SPEC_v51_part10 §6.6
 */
export interface UpdateTfWeightsInput {
  weights: TfWeight
}

/**
 * TfWeightsUpdateResponse — PATCH /api/v1/predictions/jobs/:id/tf-weights レスポンス型
 * 参照: SPEC_v51_part10 §6.6 / SPEC_v51_part8 §2.3
 */
export interface TfWeightsUpdateResponse {
  jobId:     string
  tfWeights: TfWeight
  updatedAt: string
}

// ══════════════════════════════════════════
// API 型定義
// ══════════════════════════════════════════

// 標準 API レスポンス形式
export interface ApiSuccess<T = unknown> {
  success: true
  data: T
}

export interface ApiError {
  success: false
  error: {
    code: string
    message: string
    details?: unknown
  }
}

export type ApiResponse<T = unknown> = ApiSuccess<T> | ApiError

// ── User ──────────────────────────────────

export interface UserDto {
  id: string
  email: string
  role: UserRole
  status: UserStatus
  createdAt: string
  updatedAt: string
  lastLoginAt: string | null
}

// ── Auth ──────────────────────────────────

export interface LoginRequestDto {
  email: string
  password: string
}

export interface LoginResponseDto {
  accessToken: string
  user: UserDto
}

export interface RefreshTokenResponseDto {
  accessToken: string
}

// ── Trade ─────────────────────────────────

export interface TradeDto {
  id: string
  userId: string
  symbol: string
  side: TradeSide
  entryTime: string
  entryPrice: string   // Decimal → string (API返却時)
  exitTime: string | null
  exitPrice: string | null
  size: string
  sl: string | null
  tp: string | null
  pnl: string | null
  pips: string | null
  status: TradeStatus
  tags: string[]
  note: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateTradeDto {
  symbol: string
  side: TradeSide
  entryTime: string
  entryPrice: number
  exitTime?: string
  exitPrice?: number
  size: number
  sl?: number
  tp?: number
  pnl?: number
  pips?: number
  status?: TradeStatus
  tags?: string[]
  note?: string
}

export interface UpdateTradeDto extends Partial<CreateTradeDto> {}

// ── Snapshot ─────────────────────────────

export interface SnapshotResponse {
  id: string
  symbol: string
  timeframe: Timeframe
  capturedAt: string
  scoreTotal: number
  scoreBreakdown: {
    technical: number
    fundamental: number
    market: number
    rr: number
    patternBonus: number
  }
  entryState: EntryState
  entryDecision: {
    status: EntryState
    reasons: string[]
    recommendation: string
  } | null
  indicators: unknown
  patterns: unknown
  mtfAlignment: unknown
  entryContext: unknown
  createdAt: string
}

// ── Signal ────────────────────────────────
// 参照: SPEC_v51_part3 §9

export interface SignalResponse {
  id: string
  symbol: string
  timeframe: Timeframe
  type: SignalType
  triggeredAt: string
  acknowledgedAt: string | null
  metadata: Record<string, unknown>
  snapshot: {
    id: string
    scoreTotal: number
    entryState: EntryState
  }
}

// ── UserSetting ───────────────────────────

export interface UserSettingDto {
  id: string
  userId: string
  preset: Preset
  scoreThreshold: number
  riskProfile: RiskProfile
  uiPrefs: UiPrefs
  featureSwitches: FeatureSwitches
  forceLock: boolean
  updatedAt: string
}

// ── PredictionJob ─────────────────────────

export interface PredictionJobDto {
  id: string
  userId: string
  symbol: string
  timeframe: Timeframe
  requestData: Record<string, unknown>
  status: JobStatus
  startedAt: string | null
  finishedAt: string | null
  errorMessage: string | null
  createdAt: string
}

export interface PredictionJobWithResultDto extends PredictionJobDto {
  result: PredictionResultDto | null
}

export interface PredictionResultDto {
  id: string
  jobId: string
  resultData: PredictionResultData
  createdAt: string
}

export interface CreatePredictionJobDto {
  symbol: string
  timeframe: Timeframe
}

// ══════════════════════════════════════════
// 定数
// ══════════════════════════════════════════

export const API_PREFIX = '/api/v1' as const
export const TIMEFRAMES: Timeframe[] = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'H8', 'D1', 'W1', 'MN']
export const FX_SYMBOLS = ['EURUSD', 'USDJPY', 'GBPUSD', 'AUDUSD', 'USDCHF', 'USDCAD'] as const
export const CRYPTO_SYMBOLS = ['BTCUSD', 'ETHUSD'] as const
export const DEFAULT_SYMBOLS = [...FX_SYMBOLS, ...CRYPTO_SYMBOLS] as const

// プラン別制限
export const PLAN_LIMITS: Record<UserRole, { maxSymbols: number; maxSnapshotsPerDay: number; aiSummaryPerDay: number }> = {
  FREE:     { maxSymbols: 1,  maxSnapshotsPerDay: 20,         aiSummaryPerDay: 0  },
  BASIC:    { maxSymbols: 4,  maxSnapshotsPerDay: Infinity,   aiSummaryPerDay: 3  },
  PRO:      { maxSymbols: 8,  maxSnapshotsPerDay: Infinity,   aiSummaryPerDay: Infinity },
  PRO_PLUS: { maxSymbols: 8,  maxSnapshotsPerDay: Infinity,   aiSummaryPerDay: Infinity },
  ADMIN:    { maxSymbols: 999, maxSnapshotsPerDay: Infinity,  aiSummaryPerDay: Infinity },
}

// ══════════════════════════════════════════
// Re-exports
// ══════════════════════════════════════════

export * from './schemas';

// api.ts: PaginationQuery / PaginatedResponse<T> { data, total, page, limit }
// ErrorResponse / SuccessResponse を公開する
export * from './api';
// 参照: SPEC_v51_part3 §2「共通型定義」