# FX Discipline Engine — 統合仕様書 v5.1
## SPEC-v5.1 / Part 1 : スコープ確定 · 技術スタック · アーキテクチャ · データソース

> **Single Source of Truth（唯一の真実）**
> v4 設計書群（ch01〜ch15.md）・旧 HTML ファイル群は ARCHIVE 扱い・**参照禁止**。
> 本書（SPEC_v51_part1〜10.md）が全実装判断の唯一の根拠。
> 本書に記述のない仕様は「未定義＝実装しない」。

---

## 0. 確定宣言（全実装判断の根拠 — 必ず最初に読む・変更不可）

| # | 項目 | 確定値 |
|---|------|--------|
| 0-1 | ターゲット | **v5.1**（NestJS + PostgreSQL + React SPA）|
| 0-2 | フロント | **React 18 のみ**。Vue・Angular・Svelte 使用禁止 |
| 0-3 | データソース | **公式 API 限定**。スクレイピング実装禁止（インタフェース定義のみ可）|
| 0-4 | MTF 予測（v5.1）| **スタブ実装のみ**。ジョブ受付・状態管理・STUB_PREDICTION_RESULT 固定 JSON 返却のみ実装。DTW / HMM / WFV は v6 |
| 0-5 | v5.1 完成定義 | **PoC 完成**（7 画面稼働 · 全 CRUD · JWT 認証 · 5 ロール RBAC）。課金 / Stripe は v7 |
| 0-6 | DB ロール（5 種）| **FREE / BASIC / PRO / PRO_PLUS / ADMIN のみ**。料金プランと 1:1 対応 |
| 0-7 | 監視ペア数 | **FREE=1 / BASIC=4 / PRO=8 / PRO_PLUS=8**（全 Part 統一・変更不可）|
| 0-8 | 集計 API | **都度 SQL 集計 + Redis 1 時間キャッシュ**。事前集計テーブルは v5.1 では作らない |
| 0-9 | Zod/DTO 主従 | **`packages/types` の Zod Schema が正本**。NestJS DTO は `createZodDto()` で派生。`class-validator` 手書き禁止 |
| 0-10 | ScoreBand | **LOW（0–49）/ MID（50–74）/ HIGH（75–100）のみ**。AVOID / WATCH / READY は廃止語・使用禁止 |
| 0-11 | EntryState | **ENTRY_OK / SCORE_LOW / RISK_NG / LOCKED / COOLDOWN の 5 種のみ** |
| 0-12 | スコア計算式 | `raw = tech(max40) + fund(max30) + market(max10) + rr(max10) + pattern(max+15)` → `total = min(100, max(0, raw))` |
| 0-13 | 権限表記ルール | **具体的なロール名を列挙すること**。`FREE` / `BASIC` / `PRO` / `PRO_PLUS` / `ADMIN` または `PRO \| PRO_PLUS \| ADMIN` のように書く。`PRO以上` / `有料ユーザー` / `上位プラン` などの曖昧表現は**コード・コメント・仕様書問わず禁止** |
| 0-14 | Connector health | alpha_vantage が error / unconfigured = **critical**。fred / news_api / stooq 障害 = **degraded** |
| 0-15 | Prediction スコープ | v5.1 = スタブのみ（Part 8 §9 のみ実装）。v6 = DTW / ML 本実装。**v5.1 で DTW / HMM コードを生成しない** |
| 0-16 | パターン RBAC | FREE = ローソク足 6 種のみ。BASIC 以上 = 全 12 種。フィルタはバックエンドで完結（フロント側フィルタ禁止）|
| 0-17 | API バージョン | `/api/v1` のみ。v2 追加時は Part 3 に専用節を立て旧 v1 との共存ルールを明記 |

---

## 1. プロダクト概要

| 項目 | 内容 |
|------|------|
| 名称 | FX Discipline Engine（FXDE）|
| 種別 | AI 補助型 FX トレード規律支援ツール（**投資助言ではない**）|
| 対象 | FX 個人投資家 初心者〜中級者（日本語圏）|
| 核心価値 | 感情的エントリーを機械的に遮断する「規律エンジン」 |

### 1.1 ペルソナ（確定 3 種）

| ID | 属性 | 特徴 | 推奨プリセット |
|----|------|------|:---:|
| PA | 感情トレーダー | FX 歴 1〜3 年。FOMO・リベンジで損失を繰り返す | standard |
| PB | 初心者 | FX 歴 6 ヶ月未満。基本用語が分からない | conservative |
| PC | セミプロ | システムトレード志向・バックテスト重視 | aggressive |

### 1.2 設計思想

```
AI  = アシスタント（指標整理・シナリオ提示・精度検証・日本語解説）
人間 = 最終判断者（エントリー実行・ポジション管理・想定外対応）
```

### 1.3 免責表示（全画面フッターに常時表示 — 法的必須）

```
本ツールは情報提供のみを目的とし、投資助言ではありません。
FX 取引は元本割れのリスクがあります。投資の最終判断は必ずご自身の責任で行ってください。
過去の予測精度・バックテスト結果は将来の利益を保証しません。
```

---

## 2. 料金プラン・ロール対応（確定）

| 料金プラン | DB UserRole | 月額 | 監視ペア数 | ロール付与方法 |
|-----------|:-----------:|-----:|:--------:|-------------|
| Free | `FREE` | ¥0 | **1** | 登録時自動付与 |
| Basic | `BASIC` | ¥980 | **4** | ADMIN 手動設定 |
| Pro | `PRO` | ¥2,980 | **8** | ADMIN 手動設定 |
| Pro+ | `PRO_PLUS` | ¥4,980 | **8** | ADMIN 手動設定 |
| 社内運用 | `ADMIN` | — | 無制限 | DB 直接操作のみ |

> **v5.1 課金機能**: Stripe 連携は v7 以降。v5.1 では ADMIN が手動でロールを設定する。

---

## 3. 機能別権限マトリクス（v5.1 確定版）

| 機能 | FREE | BASIC | PRO | PRO_PLUS | ADMIN |
|------|:----:|:-----:|:---:|:--------:|:-----:|
| ダッシュボード・スコア | ✅（1 ペア）| ✅（4 ペア）| ✅（8 ペア）| ✅（8 ペア）| ✅ |
| チャートパターン検出 | ✅（6 種）| ✅（12 種）| ✅（12 種）| ✅（12 種）| ✅ |
| トレード記録 CRUD | ✅ | ✅ | ✅ | ✅ | ✅ |
| スナップショット取得 | 20 回/日 | 60 回/日 | 無制限 | 無制限 | 無制限 |
| 心理分析グラフ参照期間 | 30 日 | 90 日 | 1 年 | 全期間 | 全期間 |
| AI 市場要約 | ❌ | 3 回/日 | 無制限 | 無制限 | 無制限 |
| CSV エクスポート | ❌ | ✅ | ✅ | ✅ | ✅ |
| MTF 予測ジョブ | ❌ | ❌ | ✅ | ✅ | ✅ |
| 精度検証ページ | ❌ | ❌ | ✅（3 ヶ月）| ✅（1 年）| ✅ |
| ウォークフォワード検証 | ❌ | ❌ | ❌ | ✅ | ✅ |
| 重み自動学習 | ❌ | ❌ | ❌ | ✅ | ✅ |
| API アクセス（外部連携）| ❌ | ❌ | ❌ | ✅ | ✅ |
| 監査ログ・ユーザー管理 | ❌ | ❌ | ❌ | ❌ | ✅ |

---

## 4. 技術スタック（確定・変更不可）

### 4.1 バックエンド

| レイヤー | 採用技術 | バージョン | 備考 |
|---------|---------|-----------|------|
| ランタイム | Node.js | 20 LTS | 長期サポート保証 |
| フレームワーク | NestJS | 10.x | DI / モジュール / OpenAPI 自動生成 |
| ORM | Prisma | 5.x | 型安全・マイグレーション管理 |
| DB | PostgreSQL | 16 | JSONB 対応・信頼性 |
| キャッシュ/キュー | Redis 7 + BullMQ | 最新安定 | 非同期ジョブ・TTL キャッシュ |
| 認証 | Passport.js + JWT | — | NestJS 標準 |
| PW Hash | Argon2id | — | bcrypt より安全 |
| バリデーション | **nestjs-zod**（createZodDto）| 最新安定 | **class-validator 手書き禁止** |
| API 仕様書 | OpenAPI（Swagger 自動生成）| — | フロント型共有 |
| テスト | Jest + Supertest | — | NestJS 標準 |

**JWT トークン設計（変更不可）**

| トークン種別 | 有効期限 | 保存場所 | 用途 |
|-----------|--------|---------|------|
| AccessToken（AT） | 15 分 | **Zustand メモリのみ**（localStorage / sessionStorage 禁止）| API 認可ヘッダー |
| RefreshToken（RT）| 7 日 | **HttpOnly / Secure / SameSite=Strict Cookie のみ** | AT の再発行 |

### 4.2 フロントエンド

| レイヤー | 採用技術 | バージョン |
|---------|---------|-----------|
| フレームワーク | **React 18**（Vue / Angular / Svelte 禁止）| 18.x |
| ビルドツール | Vite | 5.x |
| サーバー状態管理 | TanStack Query | 5.x |
| UI 状態管理 | Zustand | 4.x |
| UI コンポーネント | shadcn/ui + Tailwind CSS | 最新安定 |
| チャート | Recharts + カスタム SVG インライン | 2.x |
| フォーム | React Hook Form + Zod（zodResolver）| 最新安定 |
| API 通信 | Axios（TanStack Query の fetcher）| 1.x |
| 型 | TypeScript 5.x `strict: true` | 5.x |

### 4.3 インフラ・CI

| 項目 | 採用 |
|------|------|
| コンテナ | Docker + Docker Compose |
| モノレポ管理 | pnpm workspace |
| CI | GitHub Actions（lint → test → build）|
| 開発環境 | Ubuntu 24.04 LTS（`docker compose up`）|

---

## 5. Zod / DTO 主従ルール（バリデーション実装規則）

```
┌─────────────────────────────────────────────────────────────────┐
│         packages/types/src/schemas/   ← バリデーション正本       │
│         Zod Schema を変更したら自動で DTO・フォームに反映        │
├─────────────────────────────────────────────────────────────────┤
│  NestJS DTO（apps/api）                                         │
│    import { createZodDto } from 'nestjs-zod';                   │
│    export class UpdateSettingsDto                               │
│      extends createZodDto(UserSettingsSchema) {}                │
│    ※ @IsString() 等 class-validator デコレータ手書き禁止         │
│    ※ @ApiProperty() は nestjs-zod が自動生成するため追記不要      │
├─────────────────────────────────────────────────────────────────┤
│  Web フォーム（apps/web）                                        │
│    const form = useForm({ resolver: zodResolver(schema) });     │
│    ※ フォーム側でバリデーションを再定義しない                     │
└─────────────────────────────────────────────────────────────────┘
```

**絶対ルール（AI 実装時も同様）:**
1. バリデーション制約変更は必ず `packages/types/src/schemas/` を先に修正する
2. DTO ファイルやフォームファイルを直接修正しない（Zod Schema の派生で自動反映）
3. `@IsString()` / `@IsEmail()` 等の `class-validator` デコレータを手書きしない
4. `@ApiProperty()` は `nestjs-zod` が自動生成するため追記不要

```typescript
// packages/types/src/schemas/settings.schema.ts（Zod Schema 正本の例）
import { z } from 'zod';

export const RiskProfileSchema = z.object({
  maxRiskPct:      z.number().min(0.1).max(5.0),
  maxDailyLossPct: z.number().min(0.5).max(20.0),
  maxStreak:       z.number().int().min(1).max(10),
  cooldownMin:     z.number().int().min(5).max(480),
  maxTrades:       z.number().int().min(1).max(20),
  atrMultiplier:   z.number().min(0.5).max(5.0),
});

export const UserSettingsSchema = z.object({
  scoreThreshold: z.number().int().min(50).max(95),
  preset:         z.enum(['conservative', 'standard', 'aggressive']),
  riskProfile:    RiskProfileSchema.partial(),
  forceLock:      z.boolean().optional(),
});
```

---

## 6. モノレポ ディレクトリ構成

```
fxde/
├── apps/
│   ├── api/                      ← NestJS バックエンド
│   │   ├── src/
│   │   │   ├── auth/             ← JWT 認証・セッション管理
│   │   │   ├── users/            ← ユーザー CRUD
│   │   │   ├── settings/         ← ユーザー設定・プリセット
│   │   │   ├── symbols/          ← 通貨ペア設定（ペア数上限制御）
│   │   │   ├── snapshots/        ← スコア計算・スナップショット
│   │   │   ├── trades/           ← トレード記録・統計集計
│   │   │   ├── signals/          ← シグナル管理
│   │   │   ├── predictions/      ← MTF 予測ジョブ管理（v5.1: スタブのみ）
│   │   │   ├── jobs/             ← BullMQ ワーカー定義（6 キュー）
│   │   │   ├── connectors/       ← 外部 API コネクタ実装
│   │   │   └── admin/            ← 管理者専用 API（ADMIN ロールのみ）
│   │   └── prisma/schema.prisma
│   └── web/                      ← React 18 + Vite SPA
│       └── src/
│           ├── pages/            ← 7 ページ（PG-01〜PG-07）
│           ├── components/       ← 共通 UI コンポーネント
│           ├── hooks/            ← カスタムフック（TanStack Query ラッパー）
│           ├── stores/           ← Zustand（auth: AT のみ / ui: mode・theme）
│           └── lib/              ← Axios インスタンス・自動リフレッシュ
├── packages/
│   ├── types/                    ← 【Zod Schema 正本】+ 共通型定義
│   │   └── src/
│   │       ├── schemas/          ← Zod Schema（全バリデーション制約の正本）
│   │       ├── api.ts            ← レスポンス型・ページネーション型
│   │       └── enums.ts          ← UserRole / EntryState / ScoreBand 等
│   └── shared/                   ← スコアエンジン・EntryDecision・ロット計算
│       └── src/
│           ├── score-engine.ts      ← calculateScore()
│           ├── entry-decision.ts    ← evaluateEntryDecision()
│           └── lot-calculator.ts    ← calcLot() / calcSlFromAtr()
├── docker-compose.yml
├── docker-compose.dev.yml
├── pnpm-workspace.yaml
└── .github/workflows/ci.yml
```

---

## 7. システムアーキテクチャ図

```
┌─────────────────────────────────────────────────────────────────┐
│                  ブラウザ（React 18 SPA / Vite）                  │
│  PG-01:Dashboard  PG-02:Trades  PG-03:Strategy                  │
│  PG-04:Prediction[PRO+]  PG-05:Settings  PG-06:Plan             │
│  PG-07:Chart                                                     │
└────────────────────────┬────────────────────────────────────────┘
                         │ HTTPS / REST JSON  /api/v1/...
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                 NestJS API Server（apps/api）                     │
│  auth│users│settings│symbols│snapshots│trades│signals            │
│  predictions│connectors│admin                                     │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ packages/shared  ← API・フロント両方から import              │  │
│  │  calculateScore()                                          │  │
│  │    raw = tech(40) + fund(30) + market(10) + rr(10)        │  │
│  │            + pattern(+15)                                  │  │
│  │    total = min(100, max(0, raw))  ← 必ず 0–100 に収める    │  │
│  │  evaluateEntryDecision()                                   │  │
│  │    優先順: forceLock → cooldown → eventLock                │  │
│  │            → riskNg → scoreLow → ENTRY_OK                 │  │
│  │  calcLot() / calcSlFromAtr()                              │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ BullMQ Workers（7 キュー）                                   │  │
│  │  price-sync(5分) / snapshot-capture(15分)                   │  │
│  │  news-sync(1時間) / calendar-sync(15分)                     │  │
│  │  ai-summary-sync(イベント駆動)                               │  │
│  │  prediction-dispatch(イベント駆動) / cleanup(毎日 03:00 JST) │  │
│  └────────────────────────────────────────────────────────────┘  │
└─────────────┬─────────────────────┬───────────────────────────────┘
              │                     │
              ▼                     ▼
┌──────────────────┐   ┌──────────────────────────────────────────┐
│  PostgreSQL 16   │   │  Redis 7                                  │
│  （Prisma 5）    │   │  BullMQ キュー / TTL キャッシュ             │
│  11 モデル       │   │  ConnectorStatus（5 分 TTL）               │
└──────────────────┘   │  集計 API キャッシュ（1 時間 TTL）          │
                        └──────────────────────────────────────────┘
                                      ▲
                                      │ Cron / Event
               ┌──────────────────────┴───────────────────────────┐
               │               外部 API コネクタ層                   │
               │  alpha_vantage（価格主）/ oanda（価格副・任意）       │
               │  fred（経済指標）/ news_api（感情）/ stooq（カレンダー）│
               │  内部テーブル（政策金利）                            │
               └──────────────────────────────────────────────────┘
```

---

## 8. データソース仕様

### 8.1 コネクタ一覧

| コネクタ ID | 用途 | v5.1 実装 | isRequired | 環境変数 | 制限 |
|-----------|------|---------|:----------:|---------|------|
| `alpha_vantage` | FX 価格 OHLC（主）| ✅ 実装済み | **true** | `ALPHA_VANTAGE_KEY` | 500 req/日 |
| `fred` | 経済指標・政策金利 | ✅ 実装済み | **true** | `FRED_API_KEY` | 120 req/分 |
| `news_api` | ニュース感情 | ✅ 実装済み | **true** | `NEWS_API_KEY` | 100 req/日 |
| `stooq` | 経済カレンダー | ✅ 実装済み | **true** | `CALENDAR_PROVIDER=stooq` | — |
| `oanda` | FX 価格 OHLC（副）| ✅ 実装済み（任意）| **false** | `OANDA_API_KEY` / `OANDA_ACCOUNT_ID` | — |
| `trading_economics` | 高品質カレンダー | ❌ 未実装（v6）| false | `CALENDAR_PROVIDER=trading_economics` | $50/月〜 |
| スクレイピング系 | — | ❌ インタフェース定義のみ（NotImplementedException）| 禁止 | — | — |

### 8.2 overallHealth 判定ルール（確定）

```
■ コネクタ役割分類
  hard-required（price 系）: alpha_vantage
  soft-required（analysis 系）: fred, news_api, stooq
  optional: oanda（isRequired=false → health 判定対象外）

■ overallHealth の取り得る値と条件
  critical = alpha_vantage が error または unconfigured
             理由: 価格データ取得不能 → スコア計算が機能しない → 運用停止レベル

  degraded  = alpha_vantage は ok/cached だが
              fred | news_api | stooq のいずれかが error
             理由: スコアの一部要素（ファンダ点・感情点）が劣化するが動作継続可能

  healthy   = 全 isRequired=true コネクタが ok または cached
```

| コネクタ | isRequired | 役割 | 障害時 overallHealth |
|---------|:----------:|:---:|:------------------:|
| alpha_vantage | true | price / hard-required | **critical** |
| fred | true | analysis / soft-required | degraded |
| news_api | true | analysis / soft-required | degraded |
| stooq | true | analysis / soft-required | degraded |
| oanda | false | price / optional | 影響なし |

### 8.3 フォールバック戦略

| 状況 | 対応 |
|------|------|
| alpha_vantage 500 req/日 到達 | Redis キャッシュ（TTL 1h）を返す。UI に「キャッシュ値」バッジ表示 |
| fred / news_api タイムアウト | キャッシュ値継続。スコア対象項目は前回値維持。UI に警告表示 |
| コネクタ全般例外 | `ConnectorException` → GlobalExceptionFilter → HTTP 503 |
| 全コネクタ障害 | 各スコア項目 = 0 点 → total 低値 → SCORE_LOW → エントリー不可（安全側に倒れる）|

### 8.4 キャッシュ TTL

| データ種別 | TTL |
|-----------|-----|
| FX 価格 OHLC（H4 以上）| 15 分 |
| FX 価格 OHLC（H1 以下）| 5 分 |
| 経済指標データ | 1 時間 |
| ニュース感情スコア | 30 分 |
| 政策金利テーブル | 24 時間 |
| 集計 API レスポンス | 1 時間（キー: `stats:{userId}:{endpoint}:{param_hash}`）|
| コネクタ状態 | 5 分 |

---

## 9. ページ構成（確定 7 ページ）

| ページ ID | パス | 名称 | 認証 | アクセス可能ロール |
|---------|------|------|----|:---:|
| PG-01 | `/dashboard` | ダッシュボード | 要 | 全ロール |
| PG-02 | `/trades` | トレード記録 | 要 | 全ロール |
| PG-03 | `/strategy` | ストラテジー | 要 | 全ロール |
| PG-04 | `/prediction` | MTF 予測（スタブ）| 要 | `PRO \| PRO_PLUS \| ADMIN` |
| PG-05 | `/settings` | 設定・プリセット | 要 | 全ロール |
| PG-06 | `/plan` | プラン | 要 | 全ロール |
| PG-07 | `/chart` | チャート分析 | 要 | 全ロール |

> **PG-04 アクセス制御の二重保護:**
> 1. **バックエンド**: `RolesGuard` が `PRO | PRO_PLUS | ADMIN` 以外に 403 を返す（必須・常時有効）
> 2. **フロント**: `FREE | BASIC` ユーザーにはサイドバークリック時にアップグレード誘導モーダルを表示（UX）
> フロントのモーダル表示はバックエンドのガードを代替しない。両方常時有効。
>
> **PG-07 補足:** 全ロールアクセス可能だが、prediction-overlay-panel セクションは `PRO | PRO_PLUS | ADMIN` のみ有効データを返す。`FREE | BASIC` ユーザーにはロックバッジと PRO 誘導を表示する。

---

## 9a. Sidebar ナビゲーション構成（確定）

`apps/web/src/components/layout/Sidebar.tsx` における確定ナビゲーションリスト。

```typescript
// Sidebar ナビゲーションリスト（確定版）
const NAV_ITEMS = [
  { id: 'PG-01', path: '/dashboard',  label: 'ダッシュボード',  icon: GridIcon },
  { id: 'PG-02', path: '/trades',     label: 'トレード',        icon: ListIcon },
  { id: 'PG-03', path: '/strategy',   label: 'ストラテジー',    icon: LayersIcon },
  { id: 'PG-04', path: '/prediction', label: 'MTF 予測',       icon: TrendingUpIcon, proOnly: true },
  { id: 'PG-07', path: '/chart',      label: 'チャート',         icon: CandlestickIcon },
  { id: 'PG-05', path: '/settings',   label: '設定',            icon: SettingsIcon },
  { id: 'PG-06', path: '/plan',       label: 'プラン',          icon: CreditCardIcon },
];
```

- `proOnly: true` のエントリーは `FREE | BASIC` ユーザーにアップグレード誘導モーダルを表示する。
- 廃止ページ（`/patterns`・`/validation`・`/pairs`）はナビゲーションに含めない。

---

## 9b. React Router 構成（確定）

`apps/web/src/App.tsx` における確定ルーティング定義。

```typescript
// React Router v6 ルート定義（確定版）
const router = createBrowserRouter([
  {
    path: '/',
    element: <AuthLayout />,
    children: [
      { path: 'login',    element: <Login /> },
      { path: 'register', element: <Register /> },
    ],
  },
  {
    path: '/',
    element: <PrivateLayout />,   // JWT 認証ガード
    children: [
      { index: true,          element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard',    element: <Dashboard /> },
      { path: 'trades',       element: <Trades /> },
      { path: 'strategy',     element: <Strategy /> },
      { path: 'prediction',   element: <Prediction /> },  // RolesGuard: PRO | PRO_PLUS | ADMIN
      { path: 'chart',        element: <Chart /> },
      { path: 'settings',     element: <Settings /> },
      { path: 'plan',         element: <Plan /> },
    ],
  },
  { path: '*', element: <NotFound /> },
]);
```

- `/prediction` はフロント側でも `RolesGuard` 相当のアクセス制御を行い、未認可ロールには誘導モーダルを表示する。
- 廃止ルート（`/patterns`・`/validation`・`/pairs`）は定義しない。

---

## 10. 環境変数一覧（完全版）

```env
# === API (apps/api/.env) ===

# DB
DATABASE_URL=postgresql://fxde:fxde_pass@localhost:5432/fxde_dev

# Redis
REDIS_URL=redis://localhost:6379

# JWT（最低 32 文字のランダム文字列）
JWT_SECRET=change_me_32chars_minimum_here_!
JWT_REFRESH_SECRET=change_me_refresh_32chars__here!
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# 外部 API（必須）
ALPHA_VANTAGE_KEY=your_key_here
FRED_API_KEY=your_key_here
NEWS_API_KEY=your_key_here

# 外部 API（任意 — 未設定可）
OANDA_API_KEY=
OANDA_ACCOUNT_ID=

# カレンダープロバイダー（stooq のみ v5.1 実装済み）
CALENDAR_PROVIDER=stooq

# AI（Claude API）
ANTHROPIC_API_KEY=your_key_here
ANTHROPIC_MODEL=claude-sonnet-4-6

# App
PORT=3001
FRONTEND_URL=http://localhost:5173
NODE_ENV=development

# Feature Flag
FEATURE_PREDICTION_ENABLED=true   # PG-04 表示制御（false でスタブ非表示）

# === Web (apps/web/.env) ===
VITE_API_URL=http://localhost:3001
```

---

## 11. Docker Compose（開発環境）

```yaml
# docker-compose.dev.yml
services:
  api:
    build: { context: ./apps/api, dockerfile: Dockerfile.dev }
    ports: ["3001:3001"]
    volumes: ["./apps/api:/app", "/app/node_modules"]
    env_file: ./apps/api/.env
    depends_on: [db, redis]

  web:
    build: { context: ./apps/web, dockerfile: Dockerfile.dev }
    ports: ["5173:5173"]
    volumes: ["./apps/web:/app", "/app/node_modules"]
    env_file: ./apps/web/.env

  db:
    image: postgres:16-alpine
    ports: ["5432:5432"]
    environment:
      POSTGRES_DB: fxde_dev
      POSTGRES_USER: fxde
      POSTGRES_PASSWORD: fxde_pass
    volumes: [pgdata:/var/lib/postgresql/data]

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]

volumes:
  pgdata:
```

---

## 12. CHANGELOG（v5.1 vs v5）

| 変更種別 | 内容 |
|---------|------|
| 追加 | RBAC 5 ロール確定（FREE / BASIC / PRO / PRO_PLUS / ADMIN）|
| 追加 | ペア数確定: FREE=1 / BASIC=4 / PRO=8 / PRO_PLUS=8 |
| 追加 | Connector overallHealth の 3 段階定義（critical / degraded / healthy）|
| 追加 | PG-07 チャート分析ページ（`/chart`）追加 — 全ロールアクセス可 |
| 追加 | BullMQ キュー: ai-summary-sync（イベント駆動）追加 → 計 7 キュー |
| 変更 | ページ構成: 6 ページ → 7 ページ（PG-01〜PG-07）|
| 変更 | ページ ID 体系: Part 10 §0 の確定 7 ページ構成に統一 |
| 変更 | Sidebar 順序: Dashboard / Trades / Strategy / Prediction / **Chart** / Settings / Plan に確定 |
| 変更 | Sidebar・Router: 7 ページ構成に対応した NAV_ITEMS / ルート定義に更新 |
| 変更 | Redis キャッシュ TTL: H4以上 → 15 分 / H1以下 → 5 分（AlphaVantage 500 req/日 制限に対応）|
| 変更 | Prediction: スタブ実装のみ（DTW / HMM / WFV は v6 に移動）|
| 変更 | Zod Schema 正本化（class-validator 手書き廃止）|
| 廃止 | ScoreBand AVOID / WATCH / READY（LOW / MID / HIGH のみ）|
| 廃止 | 権限表記「PRO以上」（具体列挙に統一）|
| 廃止 | ページ: `/patterns`・`/validation`・`/pairs`（7 ページ構成外）|

---

*Part 1 完了 — 次: Part 2 → ER 図 · Prisma Schema · テーブル定義*
