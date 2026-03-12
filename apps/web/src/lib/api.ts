// apps/web/src/lib/api.ts
//
// 変更内容:
//   [Task3] signalsApi.latest 削除
//           → GET /signals/latest は SPEC_v51_part10 §6.5 に存在しない
//           → フロント側の使用箇所なし（queries.ts の useLatestSignals は list({limit:5}) を使用済み）
//
/**
 * 参照仕様:
 *   SPEC_v51_part3 §2（共通型定義）§5（Settings）§8（Trades）§9（Signals）
 *   SPEC_v51_part10 §6.5（signals API 正本）
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
  PaginatedResponse,
  SignalResponse,
  SnapshotResponse,
} from '@fxde/types';

// ── ローカル補完型 ──────────────────────────────────────────────────────────
/** バックエンド trades.service.ts getReview 返却形式 */
export interface TradeReviewResponse {
  id: string;
  tradeId: string;
  scoreAtEntry: number;
  ruleChecks: unknown;
  psychology: unknown;
  disciplined: boolean;
  createdAt: string;
  updatedAt: string;
}

// ── ページネーション補助型 ────────────────────────────────────────────────
export interface PaginationParams {
  page?: number;
  limit?: number;
}

// ── Axios インスタンス ──────────────────────────────────────────────────────
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
      const { data } = await axios.post<{ accessToken: string }>(
        `${API_BASE_URL}/api/v1/auth/refresh`,
        {},
        { withCredentials: true, timeout: 15000 },
      );
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

export default api;

// ── Auth API ────────────────────────────────────────────────────────────────
export const authApi = {
  login:   (body: LoginRequestDto) =>
    api.post<LoginResponseDto>('/auth/login', body).then((r) => r.data),
  logout:  () => api.post('/auth/logout').then((r) => r.data),
  refresh: () => api.post<{ accessToken: string }>('/auth/refresh').then((r) => r.data),
};

// ── Users API ─────────────────────────────────────────────────────────────
export const userApi = {
  me:     () => api.get<UserDto>('/users/me').then((r) => r.data),
  update: (body: { password?: string }) =>
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
export const symbolsApi = {
  list:   () => api.get<unknown[]>('/symbols').then((r) => r.data),
  update: (symbol: string, body: UpdateSymbolSettingDto) =>
    api.patch(`/symbols/${symbol}`, body).then((r) => r.data),
};

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
  equityCurve:  (period: '1M' | '3M' | '1Y') =>
    api.get('/trades/equity-curve', { params: { period } }).then((r) => r.data),
  summary:      () =>
    api.get('/trades/stats/summary').then((r) => r.data),
};

// ── Snapshots API ─────────────────────────────────────────────────────────
// /snapshots/latest → 単一 SnapshotResponse
// 参照: SPEC_v51_part3 §7
export const snapshotsApi = {
  list:    (params?: PaginationParams & { symbol?: string; timeframe?: string }) =>
    api.get<PaginatedResponse<SnapshotResponse>>('/snapshots', { params }).then((r) => r.data),
  latest:  (params?: { symbol?: string; timeframe?: string }) =>
    api.get<SnapshotResponse>('/snapshots/latest', { params }).then((r) => r.data),
  capture: (body: { symbol: string; timeframe: string; asOf?: string }) =>
    api.post<SnapshotResponse>('/snapshots/capture', body).then((r) => r.data),
};

// ── Signals API ───────────────────────────────────────────────────────────
// 参照: SPEC_v51_part10 §6.5（正本）
// エンドポイント:
//   GET  /signals        → 一覧（ページネーション・フィルター）
//   POST /signals/:id/ack → 確認済み登録
// ⚠️ /signals/latest は SPEC_v51_part10 §6.5 に存在しないため削除
//    Dashboard の最新シグナル表示は list({ limit: 5 }) で代替
export const signalsApi = {
  list: (params?: PaginationParams & { symbol?: string }) =>
    api.get<PaginatedResponse<SignalResponse>>('/signals', { params }).then((r) => r.data),
  ack:  (id: string) =>
    api.post<SignalResponse>(`/signals/${id}/ack`).then((r) => r.data),
};

// ── Predictions API ───────────────────────────────────────────────────────
//
// ⚠️ STUB: backend 未実装
//
// TODO: apps/api/src/modules/predictions/ モジュールが存在しない。
//       app.module.ts に PredictionsModule が import されていない。
//       backend 実装完了後に stub フラグを解除すること。
//
// 実装対象 API（SPEC_v51_part3 §10）:
//   POST /api/v1/predictions/jobs       → 予測ジョブ登録（PRO | PRO_PLUS | ADMIN）
//   GET  /api/v1/predictions/jobs/:id   → ジョブ状態確認（5秒ポーリング）
//   GET  /api/v1/predictions/latest     → 最新予測結果（v5.1: スタブ固定 JSON）
//
// backend 実装手順:
//   1. apps/api/src/modules/predictions/predictions.module.ts を作成
//   2. apps/api/src/modules/predictions/predictions.controller.ts を作成
//   3. apps/api/src/modules/predictions/predictions.service.ts を作成
//   4. apps/api/src/app.module.ts に PredictionsModule を import 追加
//   5. このファイルの STUB フラグを解除する
//
import type {
  CreatePredictionJobDto,
  PredictionJobWithResultDto,
} from '@fxde/types';

// ── Predictions レスポンス型（SPEC_v51_part3 §10 正本）────────────────────
export interface CreateJobResponse {
  jobId: string;
  status: 'QUEUED';
  estimatedSeconds: number; // v5.1 スタブでは固定値を返す
}

export interface JobStatusResponse {
  jobId: string;
  status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  createdAt: string;
  completedAt: string | null;
  errorMessage?: string;
}

// TODO: backend 実装完了後に stub 実装を本実装へ差し替えること
export const predictionsApi = {
  /**
   * POST /api/v1/predictions/jobs
   * TODO: backend の predictions module が未実装のため、現在は呼び出し不可。
   * backend 実装完了まで Prediction.tsx からこの関数を呼ばないこと。
   */
  createJob: (_body: CreatePredictionJobDto): Promise<CreateJobResponse> => {
    // TODO: stub → 本実装へ差し替え
    // return api.post<CreateJobResponse>('/predictions/jobs', body).then((r) => r.data);
    return Promise.reject(new Error('[STUB] predictions backend not implemented yet'));
  },

  /**
   * GET /api/v1/predictions/jobs/:id
   * TODO: backend の predictions module が未実装のため、現在は呼び出し不可。
   */
  getJob: (_id: string): Promise<JobStatusResponse> => {
    // TODO: stub → 本実装へ差し替え
    // return api.get<JobStatusResponse>(`/predictions/jobs/${id}`).then((r) => r.data);
    return Promise.reject(new Error('[STUB] predictions backend not implemented yet'));
  },

  /**
   * GET /api/v1/predictions/latest
   * TODO: backend の predictions module が未実装のため、現在は呼び出し不可。
   */
  latest: (): Promise<PredictionJobWithResultDto> => {
    // TODO: stub → 本実装へ差し替え
    // return api.get<PredictionJobWithResultDto>('/predictions/latest').then((r) => r.data);
    return Promise.reject(new Error('[STUB] predictions backend not implemented yet'));
  },
};