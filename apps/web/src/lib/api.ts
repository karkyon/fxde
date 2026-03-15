/**
 * apps/web/src/lib/api.ts
 *
 * 参照仕様:
 *   SPEC_v51_part3 §2（共通型定義）§5（Settings）§8（Trades）§9（Signals）§11（集計）
 *   SPEC_v51_part10 §6.5（signals API 正本）§6.8（集計・統計系）
 *   SPEC_v51_part11（Chart API）
 */

import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';

// ── 正本型（packages/types から import）────────────────────────────────────
import type {
  UserDto,
  TradeDto,
  UserSettingDto,
  LoginRequestDto,
  LoginResponseDto,
  CreateTradeInput,
  UpdateTradeInput,
  CloseTradeInput,
  CreateTradeReviewInput,
  UpdateSettingsDto,
  ApplyPresetDto,
  UpdateSymbolSettingDto,
  SymbolWithSettingDto,
  PaginatedResponse,
  SignalResponse,
  SnapshotResponse,
  EquityCurveResponse,
  TradeSummaryResponse,
  CorrelationMatrix,
  TradeReviewResponse,
  // Plugin System（fxde_plugin_system_完全設計書 §20.5）
  PluginListResponse,
  PluginDetailResponse,
  PluginSourcePreviewResponse,
  TogglePluginResponse,
  PluginAuditLogListResponse,
  ChartPluginRuntimeResponse,
} from '@fxde/types';

// ── ページネーション補助型 ────────────────────────────────────────────────
export interface PaginationParams {
  page?: number;
  limit?: number;
}

// ── Axios インスタンス ──────────────────────────────────────────────────────
// ⚠️ VITE_API_BASE_URL は /api/v1 を含まないこと（例: http://localhost:3011）
// api.ts 側で /api/v1 を付与するため、env に含めると二重になる
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.trim() ||
  `${window.location.protocol}//${window.location.hostname}:3011`;

const api: AxiosInstance = axios.create({
  baseURL: `${API_BASE_URL}/api/v1`,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
});

// ── メモリトークン管理 ─────────────────────────────────────────────────────
// localStorage 保存禁止（SPEC_v51_part4 セキュリティ要件）
let memoryToken: string | null = null;

export function getAccessToken(): string | null { return memoryToken; }
export function setAccessToken(token: string): void { memoryToken = token; }
export function clearAccessToken(): void { memoryToken = null; }

// ── Request Interceptor ────────────────────────────────────────────────────
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAccessToken();
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ── Response Interceptor（401 自動リフレッシュ）────────────────────────────
const AUTH_URLS = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout'];
let isRefreshing = false;
let pendingQueue: Array<{ resolve: (t: string) => void; reject: (e: unknown) => void }> = [];

function processQueue(error: unknown, token?: string) {
  for (const item of pendingQueue) {
    error ? item.reject(error) : item.resolve(token!);
  }
  pendingQueue = [];
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const orig = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    const url = orig?.url ?? '';
    const isAuthUrl = AUTH_URLS.some((u) => url.includes(u));

    if (!orig || isAuthUrl || error.response?.status !== 401 || orig._retry) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        pendingQueue.push({
          resolve: (token: string) => {
            orig.headers = orig.headers ?? {};
            orig.headers.Authorization = `Bearer ${token}`;
            resolve(api(orig));
          },
          reject,
        });
      });
    }

    orig._retry = true;
    isRefreshing = true;

    try {
      const { data } = await api.post<{ accessToken: string }>('/auth/refresh');
      setAccessToken(data.accessToken);
      processQueue(null, data.accessToken);
      orig.headers = orig.headers ?? {};
      orig.headers.Authorization = `Bearer ${data.accessToken}`;
      return api(orig);
    } catch (refreshError) {
      processQueue(refreshError);
      clearAccessToken();
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  },
);

// ── Auth API ──────────────────────────────────────────────────────────────
// 参照: SPEC_v51_part3 §3
export const authApi = {
  login:    (body: LoginRequestDto) =>
    api.post<LoginResponseDto>('/auth/login', body).then((r) => r.data),
  refresh:  () =>
    api.post<{ accessToken: string }>('/auth/refresh').then((r) => r.data),
  logout:   () =>
    api.post('/auth/logout').then((r) => r.data),
  register: (body: { email: string; password: string }) =>
    api.post<LoginResponseDto>('/auth/register', body).then((r) => r.data),
};

// ── Users API ─────────────────────────────────────────────────────────────
// 参照: SPEC_v51_part3 §4
export const usersApi = {
  me:     () => api.get<UserDto>('/users/me').then((r) => r.data),
  update: (body: { email?: string; password?: string }) =>
    api.patch<UserDto>('/users/me', body).then((r) => r.data),
};

// ── Settings API ──────────────────────────────────────────────────────────
// 正本フィールド: preset / scoreThreshold / riskProfile / uiPrefs / featureSwitches / forceLock
// 参照: SPEC_v51_part3 §5
export const settingsApi = {
  get:         () => api.get<UserSettingDto>('/settings').then((r) => r.data),
  update:      (body: UpdateSettingsDto) =>
    api.patch<UserSettingDto>('/settings', body).then((r) => r.data),
  applyPreset: (body: ApplyPresetDto) =>
    api.patch<UserSettingDto>('/settings/preset', body).then((r) => r.data),
};

// ── Symbols API ───────────────────────────────────────────────────────────
// 参照: SPEC_v51_part3 §6 / §11
// list() はシステム定義8ペア + ユーザー SymbolSetting をマージした一覧を返す
// correlation() は PRO | PRO_PLUS | ADMIN のみ利用可
export const symbolsApi = {
  list:   () => api.get<SymbolWithSettingDto[]>('/symbols').then((r) => r.data),
  update: (symbol: string, body: UpdateSymbolSettingDto) =>
    api.patch(`/symbols/${symbol}`, body).then((r) => r.data),
  /**
   * GET /api/v1/symbols/correlation?period=30d|90d
   * 通貨ペア相関マトリクス（−1.0〜+1.0）
   * 権限: PRO | PRO_PLUS | ADMIN
   * 参照: SPEC_v51_part3 §11 / SPEC_v51_part7 §2.4 / SPEC_v51_part10 §6.8
   */
  correlation: (params?: { period?: '30d' | '90d' }) =>
    api.get<CorrelationMatrix>('/symbols/correlation', { params }).then((r) => r.data),
};

// UpdateSymbolSettingDto を外部に再エクスポート（useUpdateSymbol が参照するため型だけ保持）
export type { UpdateSymbolSettingDto };

// TradeReviewResponse を re-export（TradeDetail.tsx が '../lib/api' から参照するため）
export type { TradeReviewResponse } from '@fxde/types';

// ── Trades API ────────────────────────────────────────────────────────────
// 正本フィールド: side / size / sl / tp / entryTime / exitTime / note / tags
// CANCELED（末尾 D 1 つ）← CANCELLED ではない（SPEC_v51_part2 §2 Prisma enum）
// 参照: SPEC_v51_part3 §8
export const tradesApi = {
  list: (params?: PaginationParams & { status?: string; symbol?: string; side?: string; include?: 'review' }) =>
    api.get<PaginatedResponse<TradeDto>>('/trades', { params }).then((r) => r.data),
  get:          (id: string) =>
    api.get<TradeDto>(`/trades/${id}`).then((r) => r.data),
  create:       (body: CreateTradeInput) =>
    api.post<TradeDto>('/trades', body).then((r) => r.data),
  update:       (id: string, body: UpdateTradeInput) =>
    api.patch<TradeDto>(`/trades/${id}`, body).then((r) => r.data),
  close:        (id: string, body: CloseTradeInput) =>
    api.post<TradeDto>(`/trades/${id}/close`, body).then((r) => r.data),
  cancel:       (id: string) =>
    api.delete(`/trades/${id}`).then((r) => r.data),
  getReview:    (id: string) =>
    api.get<TradeReviewResponse>(`/trades/${id}/review`).then((r) => r.data),
  createReview: (id: string, body: CreateTradeReviewInput) =>
    api.post<TradeReviewResponse>(`/trades/${id}/review`, body).then((r) => r.data),
  equityCurve:  (period: '1M' | '3M' | '1Y' = '1M') =>
    api.get<EquityCurveResponse>('/trades/equity-curve', { params: { period } }).then((r) => r.data),
  summary:      () =>
    api.get<TradeSummaryResponse>('/trades/stats/summary').then((r) => r.data),
};

// ── Snapshots API ─────────────────────────────────────────────────────────
// /snapshots/latest → SnapshotResponse | null（スナップショット未存在時は null）
// 参照: SPEC_v51_part3 §7
export const snapshotsApi = {
  list:     (params?: PaginationParams & { symbol?: string; timeframe?: string }) =>
    api.get<PaginatedResponse<SnapshotResponse>>('/snapshots', { params }).then((r) => r.data),
  /**
   * GET /api/v1/snapshots/latest
   * スナップショット未存在時は null を返す（backend getLatest() の仕様）
   */
  latest:   (params?: { symbol?: string; timeframe?: string }): Promise<SnapshotResponse | null> =>
    api.get<SnapshotResponse | null>('/snapshots/latest', { params }).then((r) => r.data),
  capture:  (body: { symbol: string; timeframe: string; asOf?: string }) =>
    api.post<SnapshotResponse>('/snapshots/capture', body).then((r) => r.data),
  getById:  (id: string) =>
    api.get<SnapshotResponse>(`/snapshots/${id}`).then((r) => r.data),
  evaluate: (body: { symbol: string; timeframe: string; asOf?: string }) =>
    api.post<SnapshotResponse>('/snapshots/evaluate', body).then((r) => r.data),
};

// ── Signals API ───────────────────────────────────────────────────────────
// 参照: SPEC_v51_part10 §6.5（正本）
// エンドポイント:
//   GET  /signals        → 一覧（ページネーション・フィルター）
//   POST /signals/:id/ack → 確認済み登録
// ⚠️ /signals/latest は SPEC_v51_part10 §6.5 に存在しないため定義しない
export const signalsApi = {
  list: (params?: PaginationParams & { symbol?: string }) =>
    api.get<PaginatedResponse<SignalResponse>>('/signals', { params }).then((r) => r.data),
  ack:  (id: string) =>
    api.post<SignalResponse>(`/signals/${id}/ack`).then((r) => r.data),
};

// ── Predictions API ──────────────────────────────────────────────────────
// 参照: SPEC_v51_part3 §10「Predictions API」
//       SPEC_v51_part10 §6.6「予測系エンドポイント（確定）」
import type {
  CreatePredictionJobDto,
  PredictionScenario,
  PredictionLatestResponse,
  TfWeightsUpdateResponse,
  UpdateTfWeightsInput,
} from '@fxde/types';
export type { PredictionScenario, PredictionLatestResponse };

// ── Predictions レスポンス型（SPEC_v51_part3 §10 正本）────────────────────
export interface CreateJobResponse {
  jobId: string;
  status: 'QUEUED';
  estimatedSeconds: number;
}

export interface JobStatusResponse {
  jobId: string;
  status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  createdAt: string;
  completedAt: string | null;
  errorMessage?: string;
}

export const predictionsApi = {
  /**
   * POST /api/v1/predictions/jobs
   * 予測ジョブ登録。202 Accepted を返す。
   * 権限: PRO | PRO_PLUS | ADMIN
   * 参照: SPEC_v51_part3 §10
   */
  createJob: (body: CreatePredictionJobDto): Promise<CreateJobResponse> =>
    api.post<CreateJobResponse>('/predictions/jobs', body).then((r) => r.data),

  /**
   * GET /api/v1/predictions/jobs/:id
   * ジョブ状態確認（QUEUED / RUNNING 中は 5 秒ポーリング）
   * 権限: PRO | PRO_PLUS | ADMIN
   * 参照: SPEC_v51_part3 §10
   */
  getJob: (id: string): Promise<JobStatusResponse> =>
    api.get<JobStatusResponse>(`/predictions/jobs/${id}`).then((r) => r.data),

  /**
   * GET /api/v1/predictions/latest?symbol=EURUSD&timeframe=H4
   * 最新予測結果取得（v5.1: スタブ固定 JSON）
   * symbol 必須 / timeframe 任意
   * 権限: PRO | PRO_PLUS | ADMIN
   * 参照: SPEC_v51_part3 §10
   */
  latest: (params: { symbol: string; timeframe?: string }): Promise<PredictionLatestResponse> =>
    api.get<PredictionLatestResponse>('/predictions/latest', { params }).then((r) => r.data),

  /**
   * PATCH /api/v1/predictions/jobs/:id/tf-weights
   * TF 重み更新
   * 権限: PRO | PRO_PLUS | ADMIN
   * 参照: SPEC_v51_part3 §10
   */
  updateTfWeights: (id: string, body: UpdateTfWeightsInput): Promise<TfWeightsUpdateResponse> =>
    api.patch<TfWeightsUpdateResponse>(`/predictions/jobs/${id}/tf-weights`, body).then((r) => r.data),
};

// ── Chart API ─────────────────────────────────────────────────────────────
// 参照: SPEC_v51_part11 §2.2「エンドポイント一覧」
//       SPEC_v51_part11 §3「API エンドポイント詳細」
//       SPEC_v51_part10 §10.15「PG-07 用 API」
import type { Timeframe } from '@fxde/types';

export interface ChartMetaResponse {
  symbol:       string;
  timeframe:    Timeframe;
  currentPrice: number;
  spread:       number;
  marketStatus: 'open' | 'closed';
  sessionLabel: string;
  trendBias:    'bullish' | 'bearish' | 'neutral';
  cachedAt:     string | null;
  updatedAt:    string;
}

export interface Candle {
  time:   string;
  open:   number;
  high:   number;
  low:    number;
  close:  number;
  volume: number;
}

export interface ChartCandlesResponse {
  symbol:    string;
  timeframe: Timeframe;
  candles:   Candle[];
  cachedAt:  string | null;
}

export interface ChartIndicatorsResponse {
  symbol:    string;
  timeframe: Timeframe;
  indicators: {
    ma:   { value: number; crossStatus: string; slope: number; status: string };
    rsi:  { value: number; divergence: boolean; status: string };
    macd: { macd: number; signal: number; histogram: number; crossStatus: string; status: string };
    atr:  { value: number; ratio: number; status: 'normal' | 'high' | 'low' };
    bb:   { upper: number; middle: number; lower: number; position: string; status: string };
    bias: { direction: string; strength: string; label: string; status: string };
  };
  cachedAt:  string | null;
  updatedAt: string;
}

export interface ActiveTradeInfo {
  tradeId:      string;
  side:         'BUY' | 'SELL';
  entryPrice:   number;
  stopLoss:     number | null;
  takeProfit:   number | null;
  rrRatio:      number | null;
  lotSize:      number;
  expectedLoss: number | null;
  expectedGain: number | null;
  entryTime:    string;
}

export interface ChartTradesResponse {
  symbol:      string;
  activeTrade: ActiveTradeInfo | null;
}

export interface PatternMarker {
  id:              string;
  patternName:     string;
  patternCategory: 'CANDLESTICK' | 'FORMATION';
  direction:       string;
  confidence:      number;
  detectedAt:      string;
  barIndex:        number;
  price:           number;
  label:           string;
}

export interface ChartPatternMarkersResponse {
  symbol:    string;
  timeframe: Timeframe;
  markers:   PatternMarker[];
}

export interface ChartPredictionOverlayResponse {
  symbol:            string;
  timeframe:         Timeframe;
  mainScenario:      string;
  altScenario:       string;
  probabilities: {
    bullish: number;
    neutral: number;
    bearish: number;
  };
  expectedMovePips:  number;
  forecastHorizonH:  number;
  confidence:        'high' | 'medium' | 'low';
  stub:              true;
  generatedAt:       string;
}

export const chartApi = {
  /** GET /api/v1/chart/meta */
  meta: (params: { symbol: string; timeframe: Timeframe }): Promise<ChartMetaResponse> =>
    api.get<ChartMetaResponse>('/chart/meta', { params }).then((r) => r.data),

  /** GET /api/v1/chart/candles */
  candles: (params: { symbol: string; timeframe: Timeframe; limit?: number; before?: string }): Promise<ChartCandlesResponse> =>
    api.get<ChartCandlesResponse>('/chart/candles', { params }).then((r) => r.data),

  /** GET /api/v1/chart/indicators */
  indicators: (params: { symbol: string; timeframe: Timeframe }): Promise<ChartIndicatorsResponse> =>
    api.get<ChartIndicatorsResponse>('/chart/indicators', { params }).then((r) => r.data),

  /** GET /api/v1/chart/trades */
  trades: (params: { symbol: string }): Promise<ChartTradesResponse> =>
    api.get<ChartTradesResponse>('/chart/trades', { params }).then((r) => r.data),

  /** GET /api/v1/chart/pattern-markers */
  patternMarkers: (params: { symbol: string; timeframe: Timeframe; limit?: number }): Promise<ChartPatternMarkersResponse> =>
    api.get<ChartPatternMarkersResponse>('/chart/pattern-markers', { params }).then((r) => r.data),

  /** GET /api/v1/chart/prediction-overlay — PRO | PRO_PLUS | ADMIN のみ */
  predictionOverlay: (params: { symbol: string; timeframe: Timeframe }): Promise<ChartPredictionOverlayResponse> =>
    api.get<ChartPredictionOverlayResponse>('/chart/prediction-overlay', { params }).then((r) => r.data),
};

// ── AI Summary API ───────────────────────────────────────────────────────────
// 参照: SPEC_v51_part3 §14 / SPEC_v51_part10 §6.7

export interface AiSummaryResponse {
  id:             string | null;
  symbol:         string;
  timeframe:      string;
  summary:        string;
  generatedAt:    string | null;
  snapshotId:     string | null;
  remainingToday: number | null; // null = 無制限（PRO | PRO_PLUS | ADMIN）
}

export const aiSummaryApi = {
  /**
   * POST /api/v1/ai-summary
   * AI マーケットサマリー生成
   */
  generate: (body: { symbol: string; timeframe: string; snapshotId?: string }): Promise<AiSummaryResponse> =>
    api.post<AiSummaryResponse>('/ai-summary', body).then((r) => r.data),

  /**
   * GET /api/v1/ai-summary/latest
   * 最新 AI サマリー取得
   */
  getLatest: (params: { symbol: string; timeframe: string }): Promise<AiSummaryResponse> =>
    api.get<AiSummaryResponse>('/ai-summary/latest', { params }).then((r) => r.data),
};

// ── Plugins API ─────────────────────────────────────────────────────────────
// 参照: fxde_plugin_system_完全設計書 §7 API 設計
//
// RBAC:
//   list / detail / sourcePreview / auditLogs: ログイン済み全ロール
//   enable / disable:                          ADMIN のみ（API 側で制御）
export const pluginsApi = {
  /**
   * GET /api/v1/plugins
   * プラグイン一覧取得
   */
  list: (params?: { filter?: string; sort?: string }) =>
    api
      .get<PluginListResponse>('/plugins', { params })
      .then((r) => r.data),
 
  /**
   * GET /api/v1/plugins/:pluginId
   * プラグイン詳細取得
   */
  detail: (pluginId: string) =>
    api
      .get<PluginDetailResponse>(`/plugins/${pluginId}`)
      .then((r) => r.data),
 
  /**
   * GET /api/v1/plugins/:pluginId/source-preview
   * ソースプレビュー取得（readOnly: true 固定）
   */
  sourcePreview: (pluginId: string) =>
    api
      .get<PluginSourcePreviewResponse>(`/plugins/${pluginId}/source-preview`)
      .then((r) => r.data),
 
  /**
   * POST /api/v1/plugins/:pluginId/enable
   * プラグイン有効化（ADMIN のみ）
   */
  enable: (pluginId: string) =>
    api
      .post<TogglePluginResponse>(`/plugins/${pluginId}/enable`)
      .then((r) => r.data),
 
  /**
   * POST /api/v1/plugins/:pluginId/disable
   * プラグイン無効化（ADMIN のみ）
   */
  disable: (pluginId: string) =>
    api
      .post<TogglePluginResponse>(`/plugins/${pluginId}/disable`)
      .then((r) => r.data),
 
  /**
   * GET /api/v1/plugins/:pluginId/audit-logs
   * 監査ログ取得
   */
  auditLogs: (pluginId: string) =>
    api
      .get<PluginAuditLogListResponse>(`/plugins/${pluginId}/audit-logs`)
      .then((r) => r.data),
};

// ── Plugin Runtime API ──────────────────────────────────────────────────────
// 参照: fxde_plugin_runtime_完全設計書 §7「API 契約」
//
// RBAC:
//   chart: 全ロール（認証必須。plugin ごとの可否は backend 側で制御）
//
// ⚠️ 既存 /api/v1/chart/* エンドポイントは一切変更しない。
//    /api/v1/plugins-runtime/* として独立したエンドポイントを追加。
export const pluginsRuntimeApi = {
  /**
   * GET /api/v1/plugins-runtime/chart
   * chart runtime plugin 実行結果取得
   * overlays / signals / indicators / pluginStatuses を含む
   */
  chart: (params: { symbol: string; timeframe: string }): Promise<ChartPluginRuntimeResponse> => {
    const url = '/plugins-runtime/chart';
    // [DEBUG] リクエスト直前ログ（URL / method / Authorization 有無）
    console.log('[pluginsRuntimeApi] request', {
      url,
      method:        'GET',
      params,
      hasAuthHeader: Boolean(getAccessToken()),
    });
    return api
      .get<ChartPluginRuntimeResponse>(url, { params })
      .then((r) => {
        // [DEBUG] ステータスコード・生レスポンス本文
        console.log('[pluginsRuntimeApi] response status', r.status);
        console.log('[pluginsRuntimeApi] response body',   r.data);
        return r.data;
      })
      .catch((err: unknown) => {
        // [DEBUG] エラー詳細
        const axiosErr = err as {
          response?: { status?: number; data?: unknown };
          message?:  string;
        };
        console.error('[pluginsRuntimeApi] error', {
          status:  axiosErr?.response?.status,
          data:    axiosErr?.response?.data,
          message: axiosErr?.message,
        });
        throw err;
      });
  },
};