/**
 * apps/web/src/hooks/useInitAuth.ts
 *
 * 役割: アプリ起動時の認証状態復元フック
 *
 * 起動フロー（SPEC_v51_part4 §4 認証フロー準拠）:
 *   1. POST /auth/refresh（HttpOnly Cookie の RT を使って AT を取得）
 *   2. 成功 → GET /users/me でユーザー情報取得 → auth store に保存
 *   3. 失敗 → 未認証状態として初期化完了（ログインページへリダイレクト）
 *
 * 参照仕様: SPEC_v51_part4 §4「認証フロー」
 */

import { useEffect, useRef } from 'react';
import { setAccessToken, usersApi, authApi } from '../lib/api';
import { useAuthStore } from '../stores/auth.store';

export function useInitAuth() {
  const setUser       = useAuthStore((s) => s.setUser);
  const setToken      = useAuthStore((s) => s.setToken);
  const initDone      = useAuthStore((s) => s.initializeDone);
  const clearAuth     = useAuthStore((s) => s.clearAuth);

  const bootstrapped = useRef(false);

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;

    void (async () => {
      try {
        // Step 1: refresh cookie を使って AT を再発行
        const { accessToken } = await authApi.refresh();
        setAccessToken(accessToken);
        setToken(accessToken);

        // Step 2: me エンドポイントでユーザー情報取得
        const user = await usersApi.me();
        setUser(user);
      } catch {
        // refresh 失敗 or me 失敗 → 未認証として初期化
        clearAuth();
      } finally {
        initDone();
      }
    })();
  }, [setUser, setToken, initDone, clearAuth]);
}