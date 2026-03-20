# FXDE Playwright E2E — 最小導入設計書

<!-- 作成: 2026-03-20 / ステータス: 設計のみ完了 / 実装: 次会話 -->

## ステータス

**設計完了 / 実装は次会話**

本ドキュメントは現物監査に基づいた「Playwright E2E 最小導入の設計確定書」である。
次会話でこのドキュメントを読めば迷わず着手できる状態を目標とする。

---

## 1. 現物確認結果

### `apps/web/package.json` の現状（2026-03-20 確認）

```json
{
  "scripts": {
    "dev":       "vite",
    "build":     "tsc && vite build",
    "preview":   "vite preview",
    "lint":      "eslint src --ext .ts,.tsx",
    "typecheck": "tsc --noEmit"
  }
}
```

**`@playwright/test` が devDependencies に存在しない。**  
`e2e` スクリプトが存在しない。  
Playwright 設定ファイル（`playwright.config.ts`）が存在しない。  
→ **完全未着手。最初から導入する。**

### 既存テスト状況

| パッケージ | テスト方式 | ステータス |
|---|---|---|
| `apps/api` | Jest + Supertest (HTTP mock) | ✅ 整備済み |
| `packages/shared` | Jest (unit) | ✅ 整備済み |
| `apps/web` | なし | ❌ 未着手 |

---

## 2. 導入に必要な差分（確定）

### 2-1. `apps/web/package.json` に追加する devDependencies

```json
{
  "devDependencies": {
    "@playwright/test": "^1.44.0"
  }
}
```

### 2-2. `apps/web/package.json` に追加する scripts

```json
{
  "scripts": {
    "e2e":          "playwright test",
    "e2e:ui":       "playwright test --ui",
    "e2e:report":   "playwright show-report"
  }
}
```

### 2-3. `apps/web/playwright.config.ts`（新規作成）

```typescript
// apps/web/playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir:     './e2e',
  fullyParallel: false,  // CI 安定化のため直列実行
  retries:     process.env.CI ? 2 : 0,
  workers:     1,

  use: {
    baseURL:    process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    // スクリーンショット: 失敗時のみ保存
    screenshot: 'only-on-failure',
    video:      'off',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // dev サーバを自動起動する場合（CI 環境では事前に起動しておく）
  // webServer: {
  //   command: 'pnpm --filter @fxde/web dev',
  //   url:     'http://localhost:5173',
  //   reuseExistingServer: !process.env.CI,
  // },
});
```

### 2-4. ディレクトリ構成

```
apps/web/
  e2e/
    auth.spec.ts       ← 最初に作成するテスト（ログインフロー）
    dashboard.spec.ts  ← 2番目（ダッシュボード表示）
  playwright.config.ts
```

### 2-5. pnpm インストールコマンド（次会話で実行）

```bash
pnpm --filter @fxde/web add -D @playwright/test
pnpm exec playwright install --with-deps chromium
```

---

## 3. 対象フロー（最小）

SPEC_v51_part5 §10.4「E2E テスト（Playwright）重点フロー」に準拠した最小フロー。

### フロー 1: ログイン → ダッシュボード表示

```typescript
// apps/web/e2e/auth.spec.ts
test('ログイン → ダッシュボード表示', async ({ page }) => {
  await page.goto('/login');
  await page.fill('[data-testid="email"]',    'test@example.com');
  await page.fill('[data-testid="password"]', 'Password123!');
  await page.click('[data-testid="login-btn"]');
  await page.waitForURL('**/dashboard');
  await expect(page.locator('[data-testid="score-ring"]')).toBeVisible();
});
```

### フロー 2: スコアキャプチャ → スナップショット一覧表示

```typescript
// apps/web/e2e/dashboard.spec.ts
test('EURUSD/H4 スナップショットをキャプチャして一覧に表示される', async ({ page }) => {
  // 認証状態は localStorage or Cookie に注入する（auth helper 使用）
  await page.goto('/dashboard');
  await page.click('[data-testid="capture-btn"]');
  await expect(page.locator('[data-testid="snapshot-list"]').first()).toBeVisible({ timeout: 10000 });
});
```

### フロー 3: ログアウト → ログイン画面にリダイレクト

```typescript
test('ログアウト → /login にリダイレクト', async ({ page }) => {
  await page.goto('/dashboard');
  await page.click('[data-testid="logout-btn"]');
  await page.waitForURL('**/login');
  await expect(page).toHaveURL(/\/login/);
});
```

---

## 4. 前提条件・ブロッカー

### 4-1. `data-testid` 属性の付与状況（未確認）

現物コードで `apps/web/src/pages/*.tsx` に `data-testid` が付与されているか未確認。
次会話で確認し、不足しているものを追加する必要がある。

主要コンポーネントで必要な `data-testid` の候補:

| コンポーネント | data-testid | ページ |
|---|---|---|
| メールフォーム | `email` | Login.tsx |
| パスワードフォーム | `password` | Login.tsx |
| ログインボタン | `login-btn` | Login.tsx |
| ログアウトボタン | `logout-btn` | 共通 Nav |
| スコアリング | `score-ring` | Dashboard.tsx |
| キャプチャボタン | `capture-btn` | Dashboard.tsx |
| スナップショット一覧 | `snapshot-list` | Dashboard.tsx |

### 4-2. E2E テスト用シードデータ

E2E はリアルな DB に接続するため、テスト用アカウントのシードが必要。  
`prisma/seed.ts` に E2E 用アカウント（`e2e_test@example.com` など）を追加する。

### 4-3. バックエンド起動状態

E2E 実行時には API サーバ（port 3000 / 3011）と SPA サーバ（port 5173）が起動している必要がある。  
CI では Docker Compose で起動してから `pnpm e2e` を実行する。

---

## 5. ルート `package.json` への追加

```json
{
  "scripts": {
    "e2e": "pnpm --filter @fxde/web e2e"
  }
}
```

---

## 6. 次会話での着手手順

以下の順序で進める。

1. `apps/web/src/pages/Login.tsx` などに `data-testid` が付与されているか確認
2. 不足している `data-testid` を最小限追加（本番 UI の変更は最小差分）
3. `pnpm --filter @fxde/web add -D @playwright/test` 実行
4. `apps/web/playwright.config.ts` 作成（本ドキュメント §2-3 の内容）
5. `apps/web/e2e/auth.spec.ts` 作成（フロー 1 から）
6. `pnpm --filter @fxde/web e2e` が green になることを確認
7. フロー 2, 3 を追加

---

## 7. 既存テストへの影響

Playwright E2E は `apps/api` の Jest テストと完全に独立している。  
`pnpm -r test`（Jest）と `pnpm e2e`（Playwright）は別スクリプトであり、互いに干渉しない。  
既存の 75 件想定テストを壊さない。