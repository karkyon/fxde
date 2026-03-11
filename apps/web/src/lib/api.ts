import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import type {
  CloseTradeRequest, CreateReviewRequest, CreateTradeRequest,
  LoginRequest, LoginResponse, PaginatedResponse, PaginationParams,
  Settings, Signal, Snapshot, Symbol, Trade, TradeReview,
  UpdateSettingsRequest, UpdateTradeRequest, User,
} from '../types';

const api: AxiosInstance = axios.create({
  baseURL: 'http://localhost:3011/api/v1',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

let _memoryToken: string | null = null;
export function getAccessToken(): string | null {
  return _memoryToken ?? sessionStorage.getItem('fxde_token');
}
export function setAccessToken(token: string): void {
  _memoryToken = token;
  sessionStorage.setItem('fxde_token', token);
}
export function clearAccessToken(): void {
  _memoryToken = null;
  sessionStorage.removeItem('fxde_token');
}

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAccessToken();
  if (token && config.headers) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  return config;
});

const AUTH_URLS = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout'];
let isRefreshing = false;
let pendingQueue: Array<{ resolve: (t: string) => void; reject: (e: unknown) => void }> = [];

function processQueue(error: unknown, token: string | null = null) {
  pendingQueue.forEach((p) => (error ? p.reject(error) : p.resolve(token!)));
  pendingQueue = [];
}

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    const url = originalRequest?.url ?? '';
    const isAuthUrl = AUTH_URLS.some((u) => url.includes(u));
    if (isAuthUrl || error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        pendingQueue.push({
          resolve: (token) => {
            if (originalRequest.headers) originalRequest.headers['Authorization'] = `Bearer ${token}`;
            resolve(api(originalRequest));
          },
          reject,
        });
      });
    }
    originalRequest._retry = true;
    isRefreshing = true;
    try {
      const { data } = await axios.post(
        'http://localhost:3011/api/v1/auth/refresh',
        {},
        { withCredentials: true }
      );
      const newToken: string = data.accessToken;
      setAccessToken(newToken);
      processQueue(null, newToken);
      if (originalRequest.headers) originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
      return api(originalRequest);
    } catch (refreshError) {
      processQueue(refreshError, null);
      clearAccessToken();
      window.location.href = '/login';
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);

export default api;

export const authApi = {
  login: (body: LoginRequest) =>
    api.post<LoginResponse>('/auth/login', body).then((r) => r.data),
  logout: () => api.post('/auth/logout').then((r) => r.data),
  refresh: () =>
    api.post<{ accessToken: string }>('/auth/refresh').then((r) => r.data),
};
export const userApi = {
  me: () => api.get<User>('/users/me').then((r) => r.data),
  update: (body: Partial<User>) => api.patch<User>('/users/me', body).then((r) => r.data),
};
export const settingsApi = {
  get: () => api.get<Settings>('/settings').then((r) => r.data),
  update: (body: UpdateSettingsRequest) =>
    api.patch<Settings>('/settings', body).then((r) => r.data),
  preset: (presetName: string) =>
    api.patch<Settings>('/settings/preset', { preset: presetName }).then((r) => r.data),
};
export const symbolsApi = {
  list: () => api.get<Symbol[]>('/symbols').then((r) => r.data),
};
export const tradesApi = {
  list: (params?: PaginationParams & { status?: string; symbol?: string }) =>
    api.get<PaginatedResponse<Trade>>('/trades', { params }).then((r) => r.data),
  get: (id: string) => api.get<Trade>(`/trades/${id}`).then((r) => r.data),
  create: (body: CreateTradeRequest) => api.post<Trade>('/trades', body).then((r) => r.data),
  update: (id: string, body: UpdateTradeRequest) =>
    api.patch<Trade>(`/trades/${id}`, body).then((r) => r.data),
  close: (id: string, body: CloseTradeRequest) =>
    api.post<Trade>(`/trades/${id}/close`, body).then((r) => r.data),
  delete: (id: string) => api.delete(`/trades/${id}`).then((r) => r.data),
  getReview: (id: string) => api.get<TradeReview>(`/trades/${id}/review`).then((r) => r.data),
  createReview: (id: string, body: CreateReviewRequest) =>
    api.post<TradeReview>(`/trades/${id}/review`, body).then((r) => r.data),
};
export const snapshotsApi = {
  list: (params?: PaginationParams) =>
    api.get<PaginatedResponse<Snapshot>>('/snapshots', { params }).then((r) => r.data),
  latest: () => api.get<Snapshot>('/snapshots/latest').then((r) => r.data),
};
export const signalsApi = {
  list: (params?: PaginationParams & { symbol?: string }) =>
    api.get<PaginatedResponse<Signal>>('/signals', { params }).then((r) => r.data),
  latest: () => api.get<Signal[]>('/signals/latest').then((r) => r.data),
};
