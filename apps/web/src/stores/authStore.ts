import { create } from 'zustand';
import { clearAccessToken, setAccessToken } from '../lib/api';
import axios from 'axios';
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
      // axiosのインターセプターを通さず直接呼ぶ
      const res = await axios.post(
        'http://localhost:3011/api/v1/auth/login',
        credentials,
        {
          withCredentials: true,
          headers: { 'Content-Type': 'application/json' },
        }
      );
      const { accessToken, user } = res.data;
      setAccessToken(accessToken);
      set({ accessToken, user, isAuthenticated: true, isLoading: false });
    } catch (err) {
      set({ isLoading: false });
      throw err;
    }
  },

  logout: async () => {
    try {
      await axios.post(
        'http://localhost:3011/api/v1/auth/logout',
        {},
        { withCredentials: true }
      );
    } catch {
      // ignore
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
    const token = sessionStorage.getItem('fxde_token');
    if (token) {
      setAccessToken(token);
      set({ accessToken: token, isAuthenticated: true });
    }
  },
}));
