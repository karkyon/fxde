/**
 * apps/web/src/stores/auth.store.ts
 *
 * 変更理由:
 *   - ファイル名を authStore.ts → auth.store.ts に変更（SPEC_v51_part10 ディレクトリ定義準拠）
 *   - User 型を独自定義から UserDto（@fxde/types）に変更
 *   - UserDto に 'name' フィールドはないため削除
 *   - LoginRequestDto を @fxde/types から import
 *
 * 参照仕様: SPEC_v51_part5 §9.5「Zustand Auth Store」
 *           SPEC_v51_part10 ディレクトリ構成（stores/auth.store.ts）
 *           監査レポート A-1（name フィールド不整合）
 *
 * 注意: このファイルを追加したら apps/web/src/stores/authStore.ts を削除し、
 *       import 元を全ファイルで '../stores/authStore' → '../stores/auth.store' に変更すること。
 */

import { create } from 'zustand';
import { authApi, clearAccessToken, setAccessToken } from '../lib/api';
import type { LoginRequestDto, UserDto } from '@fxde/types';

interface AuthState {
  accessToken: string | null;
  /** UserDto: id / email / role / status / createdAt / updatedAt / lastLoginAt */
  user: UserDto | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isInitialized: boolean;

  login:          (credentials: LoginRequestDto) => Promise<void>;
  logout:         () => Promise<void>;
  setUser:        (user: UserDto | null) => void;
  setToken:       (token: string | null) => void;
  initializeDone: () => void;
  clearAuth:      () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken:    null,
  user:           null,
  isAuthenticated: false,
  isLoading:      false,
  isInitialized:  false,

  login: async (credentials) => {
    set({ isLoading: true });
    try {
      const { accessToken, user } = await authApi.login(credentials);
      setAccessToken(accessToken);
      set({ accessToken, user, isAuthenticated: true, isLoading: false, isInitialized: true });
    } catch (error) {
      clearAccessToken();
      set({ accessToken: null, user: null, isAuthenticated: false, isLoading: false, isInitialized: true });
      throw error;
    }
  },

  logout: async () => {
    try { await authApi.logout(); } catch { /* ignore */ }
    finally {
      clearAccessToken();
      set({ accessToken: null, user: null, isAuthenticated: false, isLoading: false });
    }
  },

  setUser: (user) =>
    set({ user, isAuthenticated: !!user }),

  setToken: (token) => {
    if (token) {
      setAccessToken(token);
      set({ accessToken: token, isAuthenticated: true });
    } else {
      clearAccessToken();
      set({ accessToken: null, isAuthenticated: false });
    }
  },

  initializeDone: () => set({ isInitialized: true }),

  clearAuth: () => {
    clearAccessToken();
    set({ accessToken: null, user: null, isAuthenticated: false, isLoading: false, isInitialized: true });
  },
}));