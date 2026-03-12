/**
 * apps/web/src/lib/api.ts
 *
 * 変更理由:
 *   独自型定義 (apps/web/src/types/index.ts) から @fxde/types へ一本化。
 *   signalsApi.latest() を Signal 単体返却に修正（backend findLatest と一致）。
 *   Settings/Trade フィールドを仕様準拠フィールド名に統一。
 *
 * 【今回修正】
 *   - ApiPaginatedResponse<T> ローカル定義を削除
 *   - @fxde/types の PaginatedResponse<T> { data, total, page, limit } に統一
 *   - PaginatedResponse を @fxde/types から import
 *   参照: SPEC_v51_part3 §2「共通型定義」packages/types/src/api.ts
 *
 * 参照仕様:
 *   SPEC_v51_part3 §2（共通型定義）§5（Settings）§8（Trades）§9（Signals）
 *   監査レポート A-1, A-2, B-1
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
// 下記型は backend の返却形式に合わせた補完定義。
// packages/types/src/index.ts への移動は今後のリファクタで対応する。

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
// PaginatedResponse<T> は @fxde/types から import 済み。
// PaginationParams は api.ts 内のクエリパラメータ構築用ローカル型として残す。
// （@fxde/types の PaginationQuery と同一形状）
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
// localStorage 保存禁止（SPEC_v51_part5 §9.6 セキュリティ要件）
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
// 注意: UserDto に 'name' フィールドはない（SPEC_v51_part3 §4）
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
// ⚠️ /signals/latest は【単一 SignalResponse】を返す。
//    旧実装が Signal[] として扱っていたのは誤り（監査レポート A-2）。
//    backend findLatest() は prisma.signal.findFirst() → 1 件返却のみ。
// 参照: SPEC_v51_part3 §9
export const signalsApi = {
  list:   (params?: PaginationParams & { symbol?: string }) =>
    api.get<PaginatedResponse<SignalResponse>>('/signals', { params }).then((r) => r.data),
  latest: (params?: { symbol?: string }) =>
    api.get<SignalResponse>('/signals/latest', { params }).then((r) => r.data),
  ack:    (id: string) =>
    api.post<SignalResponse>(`/signals/${id}/ack`).then((r) => r.data),
};