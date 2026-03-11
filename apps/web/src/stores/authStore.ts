import { create } from 'zustand';
import { authApi, clearAccessToken, setAccessToken } from '../lib/api';
import type { LoginRequest, User } from '../types';

interface AuthState {
  accessToken: string | null;
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  login: (credentials: LoginRequest) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: User) => void;
  setToken: (token: string) => void;
  initialize: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  isAuthenticated: false,
  isLoading: false,

  login: async (credentials) => {
    set({ isLoading: true });
    try {
      const { accessToken, user } = await authApi.login(credentials);
      setAccessToken(accessToken);
      set({ accessToken, user, isAuthenticated: true, isLoading: false });
    } catch (err) {
      set({ isLoading: false });
      throw err;
    }
  },

  logout: async () => {
    try {
      await authApi.logout();
    } catch {
      // サーバーエラーでもクライアント側はクリア
    } finally {
      clearAccessToken();
      set({ accessToken: null, user: null, isAuthenticated: false });
    }
  },

  setUser: (user) => set({ user }),

  setToken: (token) => {
    setAccessToken(token);
    set({ accessToken: token, isAuthenticated: true });
  },

  initialize: () => {
    // sessionStorage に残っていれば復元
    const token = sessionStorage.getItem('fxde_token');
    if (token) {
      setAccessToken(token);
      set({ accessToken: token, isAuthenticated: true });
    }
  },
}));