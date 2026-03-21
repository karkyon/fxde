/**
 * apps/web/e2e/auth.spec.ts
 *
 * E2E テスト: ログイン → ダッシュボード表示 → ログアウト
 *
 * 方針（案1）:
 *   beforeAll で POST /api/v1/auth/register を叩いてテスト用ユーザーを登録。
 *   seed.ts は変更しない。既存ユーザーの場合は 409 を無視して続行。
 *
 * 前提条件:
 *   - API サーバが E2E_API_URL（デフォルト http://localhost:3001）で起動済み
 *   - Web サーバが http://localhost:5173 で起動済み（playwright.config.ts の baseURL）
 *
 * 参照:
 *   docs/e2e-design.md §3 フロー 1 / フロー 3
 *   apps/web/src/pages/Login.tsx        — data-testid: email / password / login-btn
 *   apps/web/src/components/layout/Layout.tsx — data-testid: logout-btn
 *   apps/web/src/pages/Dashboard.tsx    — data-testid: score-ring
 */

import { test, expect, request as playwrightRequest } from '@playwright/test';

// ── テスト用ユーザー定義 ───────────────────────────────────────────────────
// seed.ts には存在しない専用アカウント。再実行時に 409 は無視して続行する。
const E2E_USER = {
  email:    'e2e_auth@fxde.test',
  password: 'E2ePassword123!',
};

// API の baseURL（Web の baseURL とは別）
// ローカルで API ポートが 3011 の場合は E2E_API_URL=http://localhost:3011 を設定
const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001';

// ── テスト用ユーザーをあらかじめ登録 ─────────────────────────────────────
test.beforeAll(async () => {
  const ctx = await playwrightRequest.newContext();
  const res = await ctx.post(`${API_URL}/api/v1/auth/register`, {
    data: E2E_USER,
  });
  // 201: 新規登録成功  /  409: 既存ユーザー（再実行時）→ どちらも続行
  if (res.status() !== 201 && res.status() !== 409) {
    const body = await res.text();
    throw new Error(`E2E ユーザー登録失敗: HTTP ${res.status()} — ${body}`);
  }
  await ctx.dispose();
});

// ── テスト 1: ログイン → ダッシュボード → score-ring 可視 ────────────────
test('ログイン → /dashboard へ遷移し score-ring が表示される', async ({ page }) => {
  await page.goto('/login');

  await page.fill('[data-testid="email"]',    E2E_USER.email);
  await page.fill('[data-testid="password"]', E2E_USER.password);
  await page.click('[data-testid="login-btn"]');

  // ダッシュボードへ遷移完了を待つ
  await page.waitForURL('**/dashboard', { timeout: 15_000 });
  await expect(page).toHaveURL(/\/dashboard/);

  // Snapshot カードが表示されていること（data-testid="score-ring" は section に付与済み）
  await expect(page.locator('[data-testid="score-ring"]')).toBeVisible({ timeout: 10_000 });
});

// ── テスト 2: ログアウト → /login にリダイレクト ────────────────────────
test('ログアウト → /login にリダイレクトされる', async ({ page }) => {
  // まずログイン状態を作る
  await page.goto('/login');
  await page.fill('[data-testid="email"]',    E2E_USER.email);
  await page.fill('[data-testid="password"]', E2E_USER.password);
  await page.click('[data-testid="login-btn"]');
  await page.waitForURL('**/dashboard', { timeout: 15_000 });

  // ログアウトボタンをクリック
  await page.click('[data-testid="logout-btn"]');

  // /login へリダイレクトされること
  await page.waitForURL('**/login', { timeout: 10_000 });
  await expect(page).toHaveURL(/\/login/);
});