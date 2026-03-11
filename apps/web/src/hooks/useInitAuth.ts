import { useEffect, useRef } from 'react';
import { useAuthStore } from '../stores/authStore';
import { userApi } from '../lib/api';
import { getAccessToken } from '../lib/api';

/**
 * アプリ起動時に一度だけ実行。
 * sessionStorage にトークンが残っている場合、
 * /users/me を叩いて user ストアを復元する。
 */
export function useInitAuth() {
  const setUser = useAuthStore((s) => s.setUser);
  const setToken = useAuthStore((s) => s.setToken);
  const initialize = useAuthStore((s) => s.initialize);
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;

    initialize(); // tokenをメモリ & storeへ

    const token = getAccessToken();
    if (!token) return;

    // tokenがある → user情報を復元
    userApi
      .me()
      .then((user) => {
        setUser(user);
        setToken(token); // isAuthenticated=true を確実にセット
      })
      .catch(() => {
        // トークン期限切れなどは refresh interceptor が処理
        // それでも失敗した場合はそのまま（loginページへ飛ぶ）
      });
  }, [initialize, setUser, setToken]);
}