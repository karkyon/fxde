# FX Discipline Engine — 統合仕様書 v5.1
## SPEC-v5.1 / Part 10 : 正本統合宣言 · ページ構成確定（7ページ）· PG-07 Chart 完全設計

> **⚠️ 本 Part は Part 1〜9 に対する上書き確定宣言を含む**
> Part 10 に記載された内容が、同一項目について Part 1〜9 と衝突する場合、
> **Part 10 を正本とする**。
> 特にページ構成・Sidebar・Router・PG番号は本 Part の定義が唯一の正本である。

---

## 0. 正本統合チェックリスト（完了宣言）

以下はチェックリストの実行結果である。各項目の確定値を記録する。

---

## 1. ページ構成（確定 7 ページ）— 正本

> Part 1 §9・Part 5 §1.2 のページ構成定義は本 Part の定義に従う。

| ページ ID | パス | 名称 | 認証 | アクセス可能ロール |
|---------|------|------|----|:---:|
| PG-01 | `/dashboard` | Dashboard | 要 | 全ロール |
| PG-02 | `/trades` | Trades + Psychology | 要 | 全ロール |
| PG-03 | `/strategy` | Strategy | 要 | 全ロール |
| PG-04 | `/prediction` | Prediction | 要 | `PRO \| PRO_PLUS \| ADMIN` |
| PG-05 | `/settings` | Settings | 要 | 全ロール |
| PG-06 | `/plan` | Plan / Upgrade | 要 | 全ロール |
| PG-07 | `/chart` | Chart | 要 | 全ロール |

### 1.1 旧ページ名の廃止宣言

以下のページ名・パスは **廃止** とする。仕様書内に残存する記述はすべて本 Part の定義に読み替える。

| 廃止ページ名 | 旧パス | 機能の移行先 |
|------------|--------|------------|
| ~~Patterns（チャートパターン分析）~~ | `/patterns` | PG-03 Strategy に統合 |
| ~~Validation（予測精度検証）~~ | `/validation` | PG-04 Prediction 内サブタブに統合 |
| ~~Pairs（マルチペア監視）~~ | `/pairs` | PG-01 Dashboard 下部パネルに統合 |

### 1.2 アクセス制御

> PG-04 Prediction の二重保護ルールは引き続き有効。

- **バックエンド**: `RolesGuard` が `PRO | PRO_PLUS | ADMIN` 以外に 403 を返す（必須・常時有効）
- **フロント**: `FREE | BASIC` ユーザーにはサイドバークリック時にアップグレード誘導モーダルを表示（UX）
- フロントのモーダル表示はバックエンドのガードを代替しない。両方常時有効。

---

## 2. Sidebar 構成（確定）— 正本

> Part 5 §1.3「Sidebar」の記述を本 Part の定義で置き換える。

```
Sidebar ナビゲーション順序（上から）:
  1. Dashboard     /dashboard    （アイコン: Grid）
  2. Trades        /trades       （アイコン: BarChart）
  3. Strategy      /strategy     （アイコン: TrendingUp）
  4. Prediction    /prediction   （アイコン: Sparkles）  ← PRO バッジ表示
  5. Chart         /chart        （アイコン: Candlestick）
  6. Settings      /settings     （アイコン: Settings）
  7. Plan          /plan         （アイコン: CreditCard）
  [免責]
```

```typescript
// apps/web/src/components/layout/Sidebar.tsx — 確定版
const NAV_ITEMS = [
  { id: 'PG-01', path: '/dashboard',  label: 'Dashboard',  icon: GridIcon },
  { id: 'PG-02', path: '/trades',     label: 'Trades',     icon: BarChartIcon },
  { id: 'PG-03', path: '/strategy',   label: 'Strategy',   icon: TrendingUpIcon },
  { id: 'PG-04', path: '/prediction', label: 'Prediction', icon: SparklesIcon, proOnly: true },
  { id: 'PG-07', path: '/chart',      label: 'Chart',      icon: CandlestickIcon },
  { id: 'PG-05', path: '/settings',   label: 'Settings',   icon: SettingsIcon },
  { id: 'PG-06', path: '/plan',       label: 'Plan',       icon: CreditCardIcon },
];
```

---

## 3. Router 構成（確定）— 正本

```typescript
// apps/web/src/router.tsx — 確定版
const routes = [
  { path: '/',            element: <Navigate to="/dashboard" replace /> },
  { path: '/dashboard',  element: <Dashboard /> },   // PG-01
  { path: '/trades',     element: <Trades /> },       // PG-02
  { path: '/strategy',   element: <Strategy /> },     // PG-03
  { path: '/prediction', element: <PredictionGuard><Prediction /></PredictionGuard> }, // PG-04
  { path: '/chart',      element: <Chart /> },        // PG-07
  { path: '/settings',   element: <Settings /> },     // PG-05
  { path: '/plan',       element: <Plan /> },         // PG-06
  { path: '/login',      element: <Login /> },
  { path: '/register',   element: <Register /> },
];

// PredictionGuard: FREE | BASIC の場合 /plan にリダイレクト
// バックエンドの RolesGuard と二重で機能する（どちらも常時有効）
```

---

## 4. PG 番号と名称の対照表（確定）— 正本

> 本表が全仕様書・コード・コメント・コミットメッセージにおける PG 番号の唯一の正本。

| PG番号 | パス | 名称 | 説明 |
|--------|------|------|------|
| PG-01 | `/dashboard` | Dashboard | エントリー判断サマリー・スコア・AI要約・マルチペア概要 |
| PG-02 | `/trades` | Trades + Psychology | トレード記録・振り返り・心理分析・損益曲線 |
| PG-03 | `/strategy` | Strategy | 戦略分析・チャートパターン 12 種・バックテスト |
| PG-04 | `/prediction` | Prediction | MTF予測シナリオ表示・精度確認UI（PRO / v5.1 = stub）|
| PG-05 | `/settings` | Settings | リスク設定・プリセット・機能スイッチ・データソース |
| PG-06 | `/plan` | Plan / Upgrade | 料金プラン・アップグレード誘導 |
| PG-07 | `/chart` | Chart | 主分析画面・チャート精査・オーバーレイ |

> **PG-04 の「類似局面」実計算は v6 設計資料であり、v5.1 では実装しない。**
> v5.1 では STUB_PREDICTION_RESULT を返すスタブ UI のみを提供する（§9 参照）。

---

## 5. フロントディレクトリ構成（確定）— 正本

> Part 5 §8.1「ディレクトリ構成」を本 Part の定義で置き換える。

```
apps/web/src/
├── pages/
│   ├── Dashboard.tsx      ← PG-01
│   ├── Trades.tsx         ← PG-02
│   ├── Strategy.tsx       ← PG-03
│   ├── Prediction.tsx     ← PG-04（PRO guard あり）
│   ├── Chart.tsx          ← PG-07
│   ├── Settings.tsx       ← PG-05
│   ├── Plan.tsx           ← PG-06
│   ├── Login.tsx
│   └── Register.tsx
├── components/
│   ├── layout/
│   │   ├── TopBar.tsx
│   │   ├── Sidebar.tsx    ← 7項目（本 Part §2 定義）
│   │   └── TickerBar.tsx
│   ├── dashboard/
│   │   ├── CommandBar.tsx
│   │   ├── ScorePanel.tsx
│   │   ├── ScoreRing.tsx
│   │   ├── ChartSvg.tsx
│   │   ├── IndicatorCard.tsx
│   │   ├── IndicatorModal.tsx
│   │   ├── FundamentalPanel.tsx
│   │   ├── LimitPanel.tsx
│   │   ├── AiSummaryBox.tsx
│   │   └── PairsPanel.tsx       ← 旧 Pairs 機能を統合
│   ├── trades/
│   │   ├── TradeForm.tsx
│   │   ├── TradeList.tsx
│   │   ├── TradeReview.tsx
│   │   └── PsychologyPanel.tsx
│   ├── strategy/
│   │   ├── PatternCard.tsx       ← 旧 Patterns 機能を統合
│   │   ├── PatternSvgPreview.tsx
│   │   ├── BacktestPanel.tsx
│   │   └── FibonacciPanel.tsx
│   ├── prediction/
│   │   ├── PredictionChart.tsx
│   │   ├── SimilarCaseCard.tsx
│   │   ├── TfWeightSlider.tsx
│   │   └── ValidationPanel.tsx   ← 旧 Validation 機能を統合
│   ├── chart/
│   │   ├── ChartOverview.tsx
│   │   ├── ChartToolbar.tsx
│   │   ├── MainChart.tsx
│   │   ├── IndicatorSummary.tsx
│   │   ├── TradeOverlayPanel.tsx
│   │   ├── PredictionOverlayPanel.tsx
│   │   ├── ChartNotes.tsx
│   │   └── RecentSignals.tsx
│   ├── settings/
│   │   ├── RiskPresetSelector.tsx
│   │   └── ConnectorStatus.tsx
│   └── common/
│       ├── BegOnly.tsx
│       ├── ProOnly.tsx
│       ├── RoleBadge.tsx
│       ├── ScoreBadge.tsx
│       ├── EntryStateChip.tsx
│       └── Disclaimer.tsx
├── hooks/
│   ├── useSnapshot.ts
│   ├── useTrades.ts
│   ├── useSignals.ts
│   ├── usePredictionJob.ts
│   ├── useSettings.ts
│   └── useSymbols.ts
├── stores/
│   ├── auth.store.ts
│   └── ui.store.ts
└── lib/
    ├── api-client.ts
    ├── token-refresh.ts
    └── formatters.ts
```

---

## 6. API エンドポイント一覧（確定）— 正本

### 6.1 認証系

| Method | Path | 説明 |
|--------|------|------|
| POST | `/api/v1/auth/register` | 新規登録 |
| POST | `/api/v1/auth/login` | ログイン（AT + RT）|
| POST | `/api/v1/auth/refresh` | トークンリフレッシュ |
| POST | `/api/v1/auth/logout` | ログアウト（RT 失効）|

### 6.2 ユーザー・設定系

| Method | Path | 説明 |
|--------|------|------|
| GET | `/api/v1/users/me` | 自分のプロフィール |
| PATCH | `/api/v1/users/me` | プロフィール更新 |
| GET | `/api/v1/settings` | 設定取得 |
| PATCH | `/api/v1/settings` | 設定更新 |
| GET | `/api/v1/symbols` | シンボル設定一覧 |
| PATCH | `/api/v1/symbols/:symbol` | シンボル設定更新 |

### 6.3 スナップショット・スコア系

| Method | Path | 説明 |
|--------|------|------|
| GET | `/api/v1/snapshots/latest` | 最新スナップショット（ポーリング用）|
| GET | `/api/v1/snapshots` | スナップショット履歴 |

### 6.4 トレード系（PG-02 用）

| Method | Path | 説明 |
|--------|------|------|
| POST | `/api/v1/trades` | トレード記録作成 |
| GET | `/api/v1/trades` | 一覧（フィルター・ページネーション）|
| GET | `/api/v1/trades/:id` | 詳細 |
| PATCH | `/api/v1/trades/:id` | 部分更新 |
| POST | `/api/v1/trades/:id/close` | クローズ（exitPrice / pnl 確定）|
| DELETE | `/api/v1/trades/:id` | 論理削除（status=CANCELED）|
| POST | `/api/v1/trades/:id/review` | 振り返り登録（心理分析）|
| GET | `/api/v1/trades/:id/review` | 振り返り取得 |

### 6.5 シグナル系

| Method | Path | 説明 |
|--------|------|------|
| GET | `/api/v1/signals` | シグナル一覧 |
| POST | `/api/v1/signals/:id/ack` | 確認済み登録 |

### 6.6 予測系（PG-04 / PG-07 用）

| Method | Path | 説明 |
|--------|------|------|
| POST | `/api/v1/predictions/jobs` | 予測ジョブ作成 |
| GET | `/api/v1/predictions/jobs/:id` | ジョブ状態確認（5秒ポーリング）|
| GET | `/api/v1/predictions/latest?symbol={symbol}&timeframe={tf}` | 最新予測結果（v5.1 は stub）|
| PATCH | `/api/v1/predictions/jobs/:id/tf-weights` | TF重み更新（スライダー設定保存）|

> 全予測系エンドポイントのアクセス権限: `PRO | PRO_PLUS | ADMIN`
> `GET /api/v1/predictions/latest` のクエリパラメータ: `symbol`（必須 例: `EURUSD`）/ `timeframe`（任意 例: `H1`）。
> PG-07 の prediction-overlay-panel は `?symbol={pair}` を必ず付与して呼び出す。
> v5.1 における DTW / HMM / 類似検索の実計算は実装しない。固定 STUB_PREDICTION_RESULT を返却する。

### 6.7 AI 要約系

| Method | Path | 説明 |
|--------|------|------|
| POST | `/api/v1/ai-summary` | AI 市場要約生成 |
| GET | `/api/v1/ai-summary/latest` | 最新 AI 要約取得 |

> `FREE`: 不可 / `BASIC`: 3回/日 / `PRO | PRO_PLUS | ADMIN`: 無制限

### 6.8 集計・統計系

| Method | Path | 説明 |
|--------|------|------|
| GET | `/api/v1/trades/equity-curve` | 損益曲線 |
| GET | `/api/v1/trades/stats/summary` | 月次サマリー |
| GET | `/api/v1/trades/stats/hourly` | 時間帯別成績 |
| GET | `/api/v1/trades/stats/consecutive-loss` | 連敗後勝率推移 |
| GET | `/api/v1/trades/stats/by-score-band` | スコア帯別損益 |
| GET | `/api/v1/symbols/correlation` | ペア相関マトリクス（`PRO | PRO_PLUS | ADMIN`）|
| GET | `/api/v1/predictions/accuracy/timestep` | 予測タイムステップ別精度（`PRO | PRO_PLUS | ADMIN`）|

> 全集計 API は**都度 SQL 集計 + Redis 1 時間キャッシュ**。事前集計テーブルは v5.1 では作らない。
> キャッシュキー: `stats:{userId}:{endpoint}:{params_hash}`

### 6.9 管理系（`ADMIN` のみ）

| Method | Path | 説明 |
|--------|------|------|
| GET | `/api/v1/admin/users` | ユーザー一覧 |
| GET | `/api/v1/admin/users/:id` | ユーザー詳細 |
| PATCH | `/api/v1/admin/users/:id/role` | ロール変更（`FREE | BASIC | PRO | PRO_PLUS` のみ設定可。ADMIN への昇格は DB 直接操作のみ）|
| GET | `/api/v1/admin/audit-logs` | 監査ログ |

### 6.10 コネクタ系

| Method | Path | 説明 |
|--------|------|------|
| GET | `/api/v1/connectors/status` | 全コネクタの接続状態一覧（全ロール）|
| POST | `/api/v1/connectors/:name/retry` | 指定コネクタを手動再試行（`ADMIN` のみ）|

> コネクタ状態は DB に保存しない。`ConnectorStatusService`（NestJS シングルトン）+ Redis 5 分 TTL で管理。
> `overallHealth` 判定: `critical`（alpha_vantage 障害）/ `degraded`（fred | news_api | stooq 障害）/ `healthy`（全 isRequired=true が ok/cached）

---

## 7. DB テーブル一覧（確定）— 正本

### 7.1 コアテーブル（Part 2 Prisma Schema 準拠）

| テーブル名 | 説明 |
|-----------|------|
| `users` | ユーザー（認証・ロール）|
| `sessions` | リフレッシュトークン管理 |
| `user_settings` | ユーザー設定・プリセット |
| `symbol_settings` | ユーザー別シンボル設定 |
| `trades` | トレード記録 |
| `trade_reviews` | 振り返り・心理分析 |
| `snapshots` | スコアスナップショット |
| `signals` | シグナル記録 |
| `prediction_jobs` | 予測ジョブ管理 |
| `prediction_results` | 予測結果（v5.1 = stub）|
| `interest_rates` | 政策金利マスタ（共有）|
| `economic_events` | 経済指標カレンダー（共有）|
| `audit_logs` | 監査ログ |

> **`plans` / `subscriptions` テーブルは v5.1 に存在しない。**
> 課金・Stripe 連携は v7 対象。v5.1 では `UserRole` enum で制御する。

### 7.2 Chart 専用テーブル — 正本は Part 11 を参照

PG-07 Chart ページの専用テーブルは **Part 11（SPEC_v51_part11_chart_api.md）を正本** とする。
本 Part はその存在と役割のみ記録する。

| テーブル名 | 役割 | 正本 |
|-----------|------|------|
| `market_candles` | ローソク足 OHLCV キャッシュ | Part 11 |
| `indicator_cache` | インジケーター計算結果キャッシュ | Part 11 |
| `pattern_detections` | チャートパターン検出ログ | Part 11 |
| `chart_snapshots` | チャート状態スナップショット | Part 11 |

> **Part 10 §7.1 のコアテーブルと Part 11 §7.2 の Chart 専用テーブルは役割が異なる。**
> Claude が PG-07 を実装する際は必ず Part 11 の DB 定義を参照すること。
> Part 11 が未作成の場合、Chart 専用テーブルの実装は保留とし、コアテーブルのみで代替する。

---

## 8. SaaS プラン制御（確定）— 正本

### 8.1 プラン定義

| ロール | 月額 | 監視ペア数 |
|--------|------|----------|
| `FREE` | ¥0 | 1 |
| `BASIC` | ¥980 | 4 |
| `PRO` | ¥2,980 | 8 |
| `PRO_PLUS` | ¥4,980 | 8 |
| `ADMIN` | — | 無制限 |

### 8.2 機能別アクセス制御表（確定）

| 機能 | FREE | BASIC | PRO | PRO_PLUS | ADMIN |
|------|:----:|:-----:|:---:|:--------:|:-----:|
| Dashboard（PG-01）| ✅ | ✅ | ✅ | ✅ | ✅ |
| Trades + Psychology（PG-02）| ✅ | ✅ | ✅ | ✅ | ✅ |
| Strategy（PG-03）| ✅ | ✅ | ✅ | ✅ | ✅ |
| Prediction（PG-04）| ❌ | ❌ | ✅ | ✅ | ✅ |
| Chart（PG-07）| ✅ | ✅ | ✅ | ✅ | ✅ |
| Settings（PG-05）| ✅ | ✅ | ✅ | ✅ | ✅ |
| Plan（PG-06）| ✅ | ✅ | ✅ | ✅ | ✅ |
| 監視ペア数 | 1 | 4 | 8 | 8 | 無制限 |
| AI 要約 | ❌ | 3回/日 | 無制限 | 無制限 | 無制限 |
| チャートパターン全 12 種 | ❌ ※6種 | ✅ | ✅ | ✅ | ✅ |
| Prediction overlay（PG-07 内）| ❌ | ❌ | ✅ | ✅ | ✅ |
| WFV・重み自動学習 | ❌ | ❌ | ❌ | ✅ | ✅ |
| API アクセス | ❌ | ❌ | ❌ | ✅ | ✅ |
| ユーザー管理 | ❌ | ❌ | ❌ | ❌ | ✅ |

> ※ FREE のチャートパターンはローソク足 6 種のみ。フィルタはバックエンドで完結（Part 1 §0-16）。

---

## 9. Prediction 仕様境界（確定）— 正本

### 9.1 v5.1 で実装するもの（許可）

```
✅ シナリオ確率表示（stub 固定値）
✅ 価格レンジ表示（stub 固定値）
✅ 信頼度表示（stub 固定値）
✅ 予測ホライズン表示（stub 固定値）
✅ 予測ジョブの受付・状態管理
✅ STUB_PREDICTION_RESULT の固定 JSON 返却
✅ PG-07 Chart の prediction-overlay-panel（stub 表示）
✅ MTF 重み設定 UI / TF 重みスライダー / PATCH tf-weights API
```

### 9.2 v5.1 で実装しないもの（禁止）

```
❌ DTW（動的時間伸縮法）
❌ HMM（隠れマルコフモデル）
❌ Auto learning / 重み自動更新
❌ ML training / モデル学習処理
❌ WFV（ウォークフォワード検証）の自動実行
❌ 類似局面の実計算（過去データ検索）
❌ 予測精度の自動計測・DB 保存
```

---

## 10. PG-07 Chart — 完全設計

> **⚠️ PG-07 Chart における正本分担（必読）**
>
> | 対象 | 正本 | 決定権 |
> |------|------|--------|
> | PG-07 の画面レイアウト・表示セクション・コンポーネント構成 | **本 Part（Part 10）§10**（唯一の正本）| 本 Part が持つ |
> | Chart 専用 API・レスポンス・キャッシュ・Chart 専用 DB テーブル | **Part 11**（唯一の正本）| Part 11 が持つ |
>
> - **Part 11 は PG-07 の UI 正本ではない。** Part 11 を参照して UI を補完・推測してはならない。
> - Part 11 に UI 構造の決定権はない。Part 11 の API レスポンス形式・DB 定義からワイヤーフレームのレイアウトを推定してはならない。
> - ワイヤーフレーム生成時は本 Part（Part 10）§10 のみを UI の根拠とすること。
> - 実装者は「UI を本 Part から」「データ取得を Part 11 から」それぞれ読むこと。

### 10.1 ページ目的と役割

| ページ | 役割 |
|--------|------|
| PG-01 Dashboard | 判断サマリー / 今どうするか |
| PG-04 Prediction | 未来シナリオの確認 |
| **PG-07 Chart** | **現在の相場を視覚的に精査する** |

```
ナビゲーションフロー:
  Dashboard（状況把握）→ Chart（視覚精査）→ Prediction（将来確認）
```

**PG-01 Dashboard の ChartSvg と PG-07 Chart の MainChart の役割区分（確定）:**

| コンポーネント | ページ | 役割定義 | 位置づけ |
|-------------|--------|---------|---------|
| `ChartSvg` | PG-01 Dashboard | エントリー判断補助の簡易サマリーチャート | 詳細分析画面ではない。表示対象を絞った軽量表示のみ。Dashboard 全体の一構成要素 |
| `MainChart` | PG-07 Chart | 主分析画面の本格チャート | 詳細確認・オーバーレイ確認・相場視覚精査の場。PG-07 の主役 |

> Dashboard と Chart は役割が異なり、UI 統合・同一コンポーネント化を前提にしない。
> ワイヤーフレーム上で見た目が類似していても、意味と責務は異なる。
> ワイヤーフレーム生成時に `ChartSvg`（PG-01）と `MainChart`（PG-07）を同一扱いしてはならない。

**設計哲学（主役はチャート）:**

```
✅ メインチャート領域を最大化する
✅ 補助 UI は最小限に抑える
✅ 右・下に情報を逃がす
❌ 補助情報 > 主役
```

### 10.2 ページモード

| モード | 概要 | 強調表示 |
|--------|------|---------|
| `analysis` | 純粋相場分析モード | indicator / market structure 中心 |
| `trade` | トレード管理モード | entry / SL / TP / RR / active trade 中心 |

toolbar のトグルで切替する（v5.1 では UI のみ実装）。

### 10.3 レイアウト構成

```
┌──────────────────────────────────────────────────────────────┐
│  [上段] chart-overview + chart-toolbar                        │
│  ペア / 時間足 / 現在価格 / ステータス / 操作ボタン群           │
├──────────────────────────────────────────────────────────────┤
│  [中段] main-chart                                            │
│  メインローソク足チャート（h-[480px] 以上）                     │
│  overlay: MA / BB / Fib / trendline                          │
│           Entry / SL / TP / Prediction path                  │
│           Trade markers / Pattern labels                      │
├─────────────────────────────────┬────────────────────────────┤
│  [下段左]                        │  [下段右]                   │
│  indicator-summary（6カード）    │  trade-overlay-panel        │
│  recent-signals（シグナル一覧）  │  prediction-overlay-panel   │
│  chart-notes（メモ欄）           │                             │
└─────────────────────────────────┴────────────────────────────┘
```

### 10.4 セクション構成（確定 8 セクション）

| # | セクション ID | 役割 |
|---|------------|------|
| 1 | `chart-overview` | ページ冒頭の概要情報（ペア・時間足・価格・セッション）|
| 2 | `chart-toolbar` | チャート操作 UI（ペア選択・TF・indicator toggle 等）|
| 3 | `main-chart` | メインチャート本体（v5.1 = placeholder）|
| 4 | `indicator-summary` | 現在の指標状態カード群（6 枚）|
| 5 | `trade-overlay-panel` | アクティブトレードの補助数値情報 |
| 6 | `prediction-overlay-panel` | Prediction overlay 補助（PRO stub）|
| 7 | `chart-notes` | トレーダーのメモ欄（v5.1 = プレースホルダー）|
| 8 | `recent-signals` | 直近シグナル一覧 |

### 10.5 chart-overview 仕様

| 要素 | 例 |
|------|-----|
| ページ見出し | "Chart" |
| 現在ペア | EUR/USD |
| 現在時間足 | H1 |
| 現在価格 | 1.0842 |
| spread | Spread 0.3 |
| market status | Open / Closed |
| session label | London Open / Tokyo / NY |
| trend bias | Trend: bullish |

### 10.6 chart-toolbar 仕様

| 要素 | 選択肢 |
|------|--------|
| pair selector | EUR/USD / USD/JPY / GBP/USD / AUD/USD |
| timeframe selector | W1 / D1 / H4 / H1 / M30 / M15 / M5 |
| chart type | Candles / Line / Area |
| indicator toggles | MA / RSI / MACD / BB / ATR / Fib / Trendline |
| overlay toggles | Entry・SL・TP / Prediction / Trade markers / Pattern labels |
| reset view | ボタン |
| snapshot | ボタン |
| fullscreen | プレースホルダーボタン |

```typescript
type IndicatorToggle = 'MA' | 'RSI' | 'MACD' | 'BB' | 'ATR' | 'Fib' | 'Trendline';
type OverlayToggle = 'entry_sl_tp' | 'prediction' | 'trade_markers' | 'pattern_labels';
```

**Prediction overlay toggle のロール制御（確定）:**

| ロール | `prediction` トグルの表示 | 動作 |
|--------|--------------------------|------|
| `FREE \| BASIC` | disabled（グレーアウト）+ PRO バッジ付き | クリック時: アップグレード誘導モーダルを表示。オーバーレイは描画しない |
| `PRO \| PRO_PLUS \| ADMIN` | 有効（通常トグル）| ON/OFF 切替。stub 固定データを overlay 表示 |

> ロール制御はフロントのみ（表示制御）ではなく、バックエンドの `GET /api/v1/chart/prediction-overlay` でも
> `RolesGuard` により `FREE | BASIC` に 403 を返す（二重保護。§1.2 の方針に準拠）。

### 10.7 main-chart 仕様

```
チャートプレースホルダー規約（v5.1）:
  高さ    : h-[480px] 以上
  スタイル : border-dashed / rounded-xl / flex items-center justify-center
  表示テキスト: "Main Chart Placeholder"
  下段インジ : "Lower Indicator Pane Placeholder"（h-[100px] 程度）

将来実装（v6 以降）:
  Lightweight Charts / TradingView Widget / Custom SVG candle chart
```

チャート上の必須 overlay ラベル（placeholder 上に配置）:

| ラベル | 色 |
|--------|-----|
| Entry | `#2EC96A` |
| SL | `#E05252` |
| TP | `#4D9FFF` |
| Prediction path | `#B07EFF` |
| Pattern tag | accent |

### 10.8 indicator-summary 仕様

6 カードを 3×2 グリッドで表示。status に応じて文字色を変える。

| カード | 表示例 | status |
|--------|--------|--------|
| MA | `MA: bullish cross` | bullish |
| RSI | `RSI: 58.3 neutral` | neutral |
| MACD | `MACD: above signal` | bullish |
| ATR | `ATR: normal` | neutral |
| BB | `BB: upper-middle` | neutral |
| Bias | `Bias: buy moderate` | bullish |

```typescript
interface IndicatorSummaryItem {
  id:     'ma' | 'rsi' | 'macd' | 'atr' | 'bb' | 'bias';
  label:  string;
  value:  string;
  status: 'bullish' | 'bearish' | 'neutral';
  // bullish=#2EC96A / bearish=#E05252 / neutral=#E8B830
}
```

### 10.9 trade-overlay-panel 仕様

| 要素 | 例 |
|------|-----|
| active trade status | LONG / SHORT / NO POSITION |
| entry price | 1.0821 |
| stop loss | 1.0790 |
| take profit | 1.0890 |
| RR ratio | 2.2 |
| lot size | 0.10 lot |
| expected loss | -¥3,100 |
| expected gain | +¥6,820 |

データソース: `GET /api/v1/trades?status=OPEN&symbol={pair}`
アクティブトレードなし時: "No Active Trade" プレースホルダーを表示。

### 10.10 prediction-overlay-panel 仕様

| 要素 | 例 |
|------|-----|
| main scenario | Bullish Continuation |
| alternative scenario | Range Consolidation |
| bullish probability | 63% |
| bearish probability | 15% |
| range probability | 22% |
| expected move | +45 pips |
| forecast horizon | 24h |
| confidence | medium |

**アクセス制御（確定）:**

- PG-07 ページ自体は全ロール（`FREE | BASIC | PRO | PRO_PLUS | ADMIN`）がアクセス可能。
- `prediction-overlay-panel` セクションのみが `PRO | PRO_PLUS | ADMIN` 限定。
- `FREE | BASIC` に対しては、セクションを非表示にせず、ロック状態 UI として表示する。

| ロール | 表示 |
|--------|------|
| `PRO \| PRO_PLUS \| ADMIN` | stub 固定データを表示（v5.1）|
| `FREE \| BASIC` | ロック状態 UI を表示（下記仕様）|

**FREE / BASIC 向けロック状態 UI 仕様（確定 — ワイヤーフレームの必須描画対象）:**

> `prediction-overlay-panel` セクション自体は常に描画する。
> `FREE | BASIC` の場合はセクション内にロック状態 UI を描画し、実データは表示しない。

| 要素 | 仕様 |
|------|------|
| 🔒 ロックバッジ | セクション上部に目立つロックアイコン + バッジ（色: `#E8B830` 推奨）|
| 利用可能ロール表記 | 「PRO / PRO_PLUS / ADMIN でご利用いただけます」の文言をバッジ直下に表示 |
| Upgrade 導線ボタン | 「プランをアップグレード」ボタン（`/plan` へ遷移）をセクション内に配置 |
| コンテキスト説明文 | 「チャートは全体をご利用いただけます。このセクションのみ PRO プラン以上が対象です」の旨の文言 |
| コンテンツ領域 | 実データ非表示。コンテンツ領域全体にぼかし（`blur`）+ ロックアイコンオーバーレイを適用 |

**バックエンド・フロント二重制御（確定）:**

- **バックエンド:** `GET /api/v1/chart/prediction-overlay` で `RolesGuard` が `FREE | BASIC` に HTTP 403 を返す（Part 11 §3.6 参照）。
- **フロント:** 403 受信時にセクションをロック状態 UI へ切り替える。ページ全体には影響しない。
- 両方の制御を常時有効にする。フロントのみ・バックエンドのみでの制御は禁止（Part 10 §1.2 準拠）。

v5.1: STUB_PREDICTION_RESULT（Part 8 §9 準拠）の固定値を参照する。

### 10.11 chart-notes 仕様

| 要素 | 用途例 |
|------|--------|
| setup note input | 「1.0840 抜けで買い」 |
| invalidation note input | 「CPI 前なので見送り」 |
| memo textarea | 自由記述 |
| save button | プレースホルダー（v5.1）|

v5.1: 永続化なし。入力値はページ内メモリ（React state）に留まり、リロードで消える。

**将来永続化（v6 対象）:** chart-notes の入力値は `chart_snapshots` テーブルの `notes` カラムに保存する。
`chart_snapshots` は「ある時点のチャート状態スナップショット」を保持するテーブルであり、
chart-notes はそのスナップショットに紐付くメモとして格納される（Part 11 DB 定義参照）。
トレード記録 CRUD との接続も v6 で行う。

### 10.12 recent-signals 仕様

テーブル形式で表示。データソース: `GET /api/v1/signals?symbol={pair}&limit=10`

| 列 | 例 |
|----|-----|
| time | 09:20 |
| type | MA cross / RSI divergence / BB breakout |
| direction | BUY / SELL |
| score | 78 |
| note | H1 確認済み |

### 10.13 オーバーレイ要素一覧

**必須:**

| 要素 | 色 | 種別 |
|------|-----|------|
| Entry line | `#2EC96A` | 実線 strokeWidth 2 |
| SL line | `#E05252` | 破線 strokeDasharray "6 3" |
| TP line | `#4D9FFF` | 破線 strokeDasharray "6 3" |
| MA（MA50）| `#4D9FFF` | 実線 strokeWidth 1.5 |
| Pattern label | accent | テキストラベル |

**任意（toolbar トグル制御）:**

| 要素 | 色 | 種別 |
|------|-----|------|
| Fib 61.8% | `#B07EFF` | 破線 strokeDasharray "3 3" |
| Fib 38.2% | `#B07EFF` | 破線 opacity 0.5 |
| Trendline | `#E8B830` | 実線 |
| Prediction path | `#B07EFF` | 破線（`PRO | PRO_PLUS | ADMIN` のみ）|
| Trade markers | `#2EC96A` / `#E05252` | 三角マーカー |
| Session zones | 半透明 fill | 背景ゾーン |

### 10.14 色ルール（Part 5 §2.4 継承）

| 用途 | 色 |
|------|-----|
| BUY / bullish | `#2EC96A` |
| SELL / bearish | `#E05252` |
| neutral / range | `#E8B830` |
| info / indicator | `#4D9FFF` |
| prediction | `#B07EFF` |
| active selection | accent（テーマ依存）|

### 10.15 PG-07 用 API — 正本は Part 11 を参照

> **Chart API の正本は Part 11（SPEC_v51_part11_chart_api.md）である。**
> 本節は参照ガイドのみとする。実装時は必ず Part 11 を参照すること。

**Chart 専用 API（正本: Part 11）:**

全 Chart 専用エンドポイントは `/api/v1/chart/` プレフィックスに統一する。
他の `/api/v1/*` エンドポイントとバージョニング・NestJS ルーティング・Gateway を一本化するため、
`/api/chart/*`（バージョン接頭辞なし）は使用しない。

| エンドポイント | 役割 |
|-------------|------|
| `GET /api/v1/chart/meta` | ペア・時間足・価格・セッション概要 |
| `GET /api/v1/chart/candles` | ローソク足 OHLCV データ |
| `GET /api/v1/chart/indicators` | インジケーター計算結果 |
| `GET /api/v1/chart/trades` | アクティブトレード情報（PG-07 向け）|
| `GET /api/v1/chart/prediction-overlay` | 予測 overlay stub（`PRO | PRO_PLUS | ADMIN` のみ）|
| `GET /api/v1/chart/pattern-markers` | チャートパターン検出マーカー |

**補助 API（本 Part §6 の `/api/v1/` 系）:**

既存の `/api/v1/` エンドポイントは PG-07 の補助的な参照に使用する。
Chart 専用機能は `/api/v1/chart/` に集約する（Part 11 定義）。

| 目的 | エンドポイント | 備考 |
|------|-------------|------|
| 直近シグナル（補助）| `GET /api/v1/signals?symbol={pair}&limit=10` | §6.5 参照 |
| 予測 stub（補助）| `GET /api/v1/predictions/latest?symbol={pair}` | §6.6 参照 / `PRO | PRO_PLUS | ADMIN` のみ |

> Part 11 が未作成の場合、`/api/v1/snapshots/latest` / `/api/v1/trades` / `/api/v1/signals` / `/api/v1/predictions/latest` を暫定的に使用する。

### 10.16 実装フェーズ計画

**Phase 1（v5.1 対象）:**

```
□ Chart.tsx ページ本体
□ chart-overview・chart-toolbar
□ main-chart placeholder（h-[480px]、overlay ラベル配置）
□ indicator-summary（6カード stub）
□ Sidebar への PG-07 追加（本 Part §2 定義）
□ React Router /chart ルート追加（本 Part §3 定義）
```

**Phase 2（v6 対象）:**

```
□ Lightweight Charts 実装（実ローソク足描画）
□ MA / BB overlay リアル描画
□ Entry / SL / TP リアル描画
□ indicator-summary リアルデータ接続
□ recent-signals リアルデータ接続
□ trade-overlay-panel アクティブトレード連携
```

**Phase 3（v6 以降）:**

```
□ prediction overlay リアル接続（DTW 本実装後）
□ chart-notes 永続化（トレード記録 CRUD と接続）
□ session zones 描画
□ trade markers 過去履歴描画
□ drawing tools（trendline 手描き等）
```

---

## 11. ワイヤーフレーム生成ルール（PG-07 専用）

Claude にワイヤーフレーム断片を生成させる際の制約。

```
出力: <section> 要素のみ
禁止: <!DOCTYPE html> / <html> / <head> / <body> / <script> / <style>
     Tailwind CDN / JavaScript / TopBar / Sidebar / Shell レイアウト
許可: Tailwind utility class（flex / grid / gap / px / py / rounded / border / text / bg）
用途: shell の <main> にそのまま貼り込める HTML 断片

チャートプレースホルダー規約:
  border-dashed / rounded-xl / h-[480px] 以上
  flex items-center justify-center
  テキスト: "Main Chart Placeholder"
  下段: "Lower Indicator Pane Placeholder"

セクション生成順序:
  1. chart-overview
  2. chart-toolbar
  3. main-chart
  4. indicator-summary
  5. trade-overlay-panel
  6. prediction-overlay-panel
  7. chart-notes
  8. recent-signals
```

---

## 12. 全体システム統合図（更新）

> Part 9 「全体システム統合図」の UI 層を以下に更新する。

```
UI 層（React SPA）— 確定 7 ページ
  PG-01 Dashboard（旧 PG-05 Pairs の機能を統合）
  PG-02 Trades + Psychology
  PG-03 Strategy（旧 PG-02 Patterns + 旧 PG-04 Validation を統合）
  PG-04 Prediction（PRO | PRO_PLUS | ADMIN / v5.1 = stub）
  PG-07 Chart（主分析画面）← 新規追加
  PG-05 Settings
  PG-06 Plan / Upgrade
```

---

## 13. SPEC 全 Part インデックス（最終版）

| Part | タイトル | 主要内容 |
|------|---------|---------|
| Part 1 | スコープ · スタック · アーキテクチャ | v5.1 確定宣言・技術スタック・モノレポ構成・データソース |
| Part 2 | ER 図 · Prisma Schema | 13 モデル完全定義・JSONB 構造・インデックス設計 |
| Part 3 | API 設計 | 全エンドポイント・DTO・バリデーション・エラーコード |
| Part 4 | スコアエンジン · 認証 · ジョブ | 計算式・EntryDecision・RBAC・BullMQ 7 キュー |
| Part 5 | 画面仕様 · フロント実装 | ※ページ構成・Sidebar・Router は **Part 10 §1〜5 を正本** とする |
| Part 6 | チャートパターン · バックテスト | 12 パターン検出アルゴリズム・PF/MDD・フィボ・エリオット |
| Part 7 | 心理分析 · マルチペア · 設定 | 損益曲線・バイアス 8 種・ペアカード・スライダー仕様 |
| Part 8 | MTF 予測設計（v5.1=スタブ / v6=DTW）| v5.1: スタブ実装のみ。v6 設計ドキュメント含む |
| Part 9 | SaaS 設計 · ロードマップ | 料金プラン・競合差別化・収益シミュ・全体統合図 |
| **Part 10** | **正本統合宣言 · PG-07 完全設計** | **ページ構成 7 ページ確定・衝突解消・Chart 完全仕様** |
| **Part 11** | **Chart API · Chart DB 完全設計** | **`/api/chart/` エンドポイント・Chart 専用テーブル 4 種** |

> **Part 10 は Part 1〜9 の以下の定義を上書きする:**
> - ページ構成（§1）
> - Sidebar 構成（§2）
> - Router 構成（§3）
> - PG 番号と名称（§4）
> - フロントディレクトリ構成（§5）
> - API エンドポイント一覧（§6）
> - DB テーブル一覧（§7）
> - SaaS プラン制御（§8）
> - Prediction 仕様境界（§9）
>
> **Part 11 は以下の定義の正本である:**
> - Chart 専用 API（`/api/chart/` 系、§10.15 参照）
> - Chart 専用 DB テーブル（`market_candles` / `indicator_cache` / `pattern_detections` / `chart_snapshots`、§7.2 参照）
>
> **Part 10・11 に記載のない事項は Part 1〜9 の定義がそのまま有効。**

---

*SPEC-v5.1 Part 10 確定（正本統合版）*
*ページ構成: 6 ページ → 7 ページ（PG 番号・名称・パス 全刷新）*
*廃止: Patterns（/patterns）/ Validation（/validation）/ Pairs（/pairs）*
*各機能移行先: Strategy / Prediction / Dashboard*
*追加: PG-07 Chart（/chart）— 主分析画面*
*Chart 専用 API・DB の正本: Part 11（SPEC_v51_part11_chart_api.md）*
