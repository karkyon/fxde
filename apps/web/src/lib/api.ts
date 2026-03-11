import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import type {
  CloseTradeRequest,
  CreateReviewRequest,
  CreateTradeRequest,
  LoginRequest,
  LoginResponse,
  PaginatedResponse,
  PaginationParams,
  Settings,
  Signal,
  Snapshot,
  Symbol,
  Trade,
  TradeReview,
  UpdateSettingsRequest,
  UpdateTradeRequest,
  User,
} from '../types';

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.trim() || `${window.location.protocol}//${window.location.hostname}:3011`;

const api: AxiosInstance = axios.create({
  baseURL: `${API_BASE_URL}/api/v1`,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
});

let memoryToken: string | null = null;

export function getAccessToken(): string | null {
  return memoryToken;
}

export function setAccessToken(token: string): void {
  memoryToken = token;
}

export function clearAccessToken(): void {
  memoryToken = null;
}

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAccessToken();
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

const AUTH_URLS = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout'];

let isRefreshing = false;
let pendingQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}> = [];

function processQueue(error: unknown, token?: string) {
  for (const item of pendingQueue) {
    if (error) {
      item.reject(error);
    } else if (token) {
      item.resolve(token);
    }
  }
  pendingQueue = [];
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    const url = originalRequest?.url ?? '';
    const isAuthUrl = AUTH_URLS.some((authUrl) => url.includes(authUrl));

    if (!originalRequest || isAuthUrl || error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        pendingQueue.push({
          resolve: (token: string) => {
            originalRequest.headers = originalRequest.headers ?? {};
            originalRequest.headers.Authorization = `Bearer ${token}`;
            resolve(api(originalRequest));
          },
          reject,
        });
      });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      const refreshResponse = await axios.post<{ accessToken: string }>(
        `${API_BASE_URL}/api/v1/auth/refresh`,
        {},
        {
          withCredentials: true,
          headers: { 'Content-Type': 'application/json' },
          timeout: 15000,
        },
      );

      const newToken = refreshResponse.data.accessToken;
      setAccessToken(newToken);
      processQueue(null, newToken);

      originalRequest.headers = originalRequest.headers ?? {};
      originalRequest.headers.Authorization = `Bearer ${newToken}`;

      return api(originalRequest);
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

export const authApi = {
  login: (body: LoginRequest) => api.post<LoginResponse>('/auth/login', body).then((r) => r.data),
  logout: () => api.post('/auth/logout').then((r) => r.data),
  refresh: () => api.post<{ accessToken: string }>('/auth/refresh').then((r) => r.data),
};

export const userApi = {
  me: () => api.get<User>('/users/me').then((r) => r.data),
  update: (body: Partial<User>) => api.patch<User>('/users/me', body).then((r) => r.data),
};

export const settingsApi = {
  get: () => api.get<Settings>('/settings').then((r) => r.data),
  update: (body: UpdateSettingsRequest) => api.patch<Settings>('/settings', body).then((r) => r.data),
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