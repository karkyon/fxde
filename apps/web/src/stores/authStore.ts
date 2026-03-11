import { create } from 'zustand';
import { authApi, clearAccessToken, setAccessToken } from '../lib/api';
import type { LoginRequest, User } from '../types';

interface AuthState {
  accessToken: string | null;
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isInitialized: boolean;
  login: (credentials: LoginRequest) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
  initializeDone: () => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  isAuthenticated: false,
  isLoading: false,
  isInitialized: false,

  login: async (credentials) => {
    set({ isLoading: true });

    try {
      const data = await authApi.login(credentials);
      const { accessToken, user } = data;

      setAccessToken(accessToken);

      set({
        accessToken,
        user,
        isAuthenticated: true,
        isLoading: false,
        isInitialized: true,
      });
    } catch (error) {
      clearAccessToken();
      set({
        accessToken: null,
        user: null,
        isAuthenticated: false,
        isLoading: false,
        isInitialized: true,
      });
      throw error;
    }
  },

  logout: async () => {
    try {
      await authApi.logout();
    } catch {
      // ignore
    } finally {
      clearAccessToken();
      set({
        accessToken: null,
        user: null,
        isAuthenticated: false,
        isLoading: false,
        isInitialized: true,
      });
    }
  },

  setUser: (user) =>
    set({
      user,
      isAuthenticated: !!user || !!useAuthStore.getState().accessToken,
    }),

  setToken: (token) => {
    if (token) {
      setAccessToken(token);
      set({
        accessToken: token,
        isAuthenticated: true,
      });
    } else {
      clearAccessToken();
      set({
        accessToken: null,
        isAuthenticated: false,
      });
    }
  },

  initializeDone: () => {
    set({ isInitialized: true });
  },

  clearAuth: () => {
    clearAccessToken();
    set({
      accessToken: null,
      user: null,
      isAuthenticated: false,
      isLoading: false,
      isInitialized: true,
    });
  },
}));