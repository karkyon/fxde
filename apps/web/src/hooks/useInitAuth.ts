import { useEffect, useRef } from 'react';
import { getAccessToken, userApi } from '../lib/api';
import { useAuthStore } from '../stores/authStore';

export function useInitAuth() {
  const setUser = useAuthStore((s) => s.setUser);
  const setToken = useAuthStore((s) => s.setToken);
  const initializeDone = useAuthStore((s) => s.initializeDone);
  const clearAuth = useAuthStore((s) => s.clearAuth);

  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;

    const bootstrap = async () => {
      const token = getAccessToken();

      if (!token) {
        initializeDone();
        return;
      }

      try {
        setToken(token);
        const user = await userApi.me();
        setUser(user);
      } catch {
        clearAuth();
      } finally {
        initializeDone();
      }
    };

    void bootstrap();
  }, [setUser, setToken, initializeDone, clearAuth]);
}