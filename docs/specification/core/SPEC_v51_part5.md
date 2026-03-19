# FX Discipline Engine — 統合仕様書 v5.1
## SPEC-v5.1 / Part 5 : 画面仕様 · フロント実装ガイド · テスト方針 · CHANGELOG

---

## 1. 画面共通仕様

### 1.1 レイアウト構造

```
┌──────────────────────────────────────────────────────┐
│  TopBar（固定）                                        │
│  ロゴ / ペア選択 / モード切替 / テーマ切替 / 時計       │
├────────────┬─────────────────────────────────────────┤
│  Sidebar   │  Ticker Bar（横スクロール 最大 8 ペア）    │
│  （固定）  ├─────────────────────────────────────────┤
│            │                                         │
│  PG-01     │         メインコンテンツ                   │
│  PG-02     │         （ページ別に変わる）               │
│  PG-03     │                                         │
│  PG-04     │                                         │
│  PG-05     │                                         │
│  PG-06     │                                         │
│  PG-07     │                                         │
│            │                                         │
│  [免責]    │                                         │
└────────────┴─────────────────────────────────────────┘
```

### 1.2 ページ構成（確定 7 ページ）

| ページ ID | パス | 名称 | 認証 | アクセス可能ロール |
|---------|------|------|----|:---:|
| PG-01 | `/dashboard` | ダッシュボード | 要 | 全ロール |
| PG-02 | `/trades` | トレード記録 | 要 | 全ロール |
| PG-03 | `/strategy` | ストラテジー | 要 | 全ロール |
| PG-04 | `/prediction` | MTF 予測（スタブ）| 要 | `PRO \| PRO_PLUS \| ADMIN` |
| PG-05 | `/settings` | 設定・プリセット | 要 | 全ロール |
| PG-06 | `/plan` | プラン | 要 | 全ロール |
| PG-07 | `/chart` | チャート分析 | 要 | 全ロール |

> **廃止ページ:** `/patterns`・`/validation`・`/pairs` は v5.1 ページ構成に含まない。旧機能は各統合先ページへ移管済み（後述）。
>
> **PG-04 アクセス制御の二重保護:**
> 1. **バックエンド**: `RolesGuard` が `PRO | PRO_PLUS | ADMIN` 以外に 403 を返す（必須・常時有効）
> 2. **フロント**: `FREE | BASIC` ユーザーにはサイドバークリック時にアップグレード誘導モーダルを表示（UX）
> フロントのモーダル表示はバックエンドのガードを代替しない。両方常時有効。
>
> **PG-07 補足:** 全ロールアクセス可能だが、prediction-overlay-panel セクションは `PRO | PRO_PLUS | ADMIN` のみ有効データを返す。`FREE | BASIC` ユーザーにはロックバッジと PRO 誘導を表示する。

### 1.3 共通コンポーネント仕様

#### TopBar

| 要素 | 仕様 |
|------|------|
| ペア選択ドロップダウン | EURUSD / USDJPY / GBPUSD / USDCHF / AUDUSD / NZDUSD / USDCAD / XAUUSD |
| モード切替 | `beginner` / `pro`（Zustand に保存。UI 表示量が変わる）|
| テーマ切替 | `dark` / `light`（shadcn/ui の `ThemeProvider`）|
| 時計 | HH:MM:SS（ローカル時刻）+ UTC 時刻を小さく併記 |
| ユーザーメニュー | メールアドレス / ロール表示 / ログアウト |

#### Ticker Bar

- 監視中のペアを横スクロール表示（FREE=1 / BASIC=4 / PRO|PRO_PLUS|ADMIN=8）
- 各ペア: シンボル / 現在価格 / 前日比（%）/ スコアバッジ（色付き）
- 価格は `price-sync` キャッシュから TanStack Query でポーリング（30 秒間隔）

#### Sidebar

- アイコン + ラベルのナビゲーションリンク（7 ページ）
- 現在ページをハイライト
- `proOnly: true` のエントリーは `FREE | BASIC` ユーザーにアップグレード誘導モーダルを表示する

```typescript
// apps/web/src/components/layout/Sidebar.tsx
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

- 廃止ページ（`/patterns`・`/validation`・`/pairs`）はナビゲーションに含めない。

#### 免責フッター

```
※ 本ツールは情報提供のみを目的とし、投資助言ではありません。
  投資の最終判断はご自身の責任で行ってください。
```

### 1.4 React Router 構成（確定）

```typescript
// apps/web/src/App.tsx
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

### 1.5 モード別表示制御

```typescript
// apps/web/src/stores/ui.store.ts
interface UiStore {
  mode:  'beginner' | 'pro';
  theme: 'dark' | 'light';
}

// apps/web/src/components/mode-guard.tsx
export const BegOnly = ({ children }) => {
  const mode = useUiStore(s => s.mode);
  return mode === 'beginner' ? <>{children}</> : null;
};
export const ProOnly = ({ children }) => {
  const mode = useUiStore(s => s.mode);
  return mode === 'pro' ? <>{children}</> : null;
};
```

---

## 2. PG-01 ダッシュボード（Dashboard）

### 2.1 レイアウト（3 カラム）

```
┌──────────────────────────────────────────────────────────────┐
│                   Command Bar（最重要）                        │
│  [行動指示 WAIT] [スコア 72] [AI確率 63%] [方向 BUY] [指標残り 47:23] │
├───────────────┬──────────────────────────┬───────────────────┤
│  Col-1        │  Col-2                   │  Col-3            │
│               │                          │                   │
│  スコアパネル  │  チャート SVG             │  AI 市場要約       │
│  ─ リングゲージ│  ─ ローソク足             │  ─ テキスト        │
│  ─ 内訳バー   │  ─ MA50 / MA200          │  ─ 3 シナリオ      │
│  ─ 勝率バッジ  │  ─ Entry / SL / TP ライン│                   │
│  ─ エントリーBtn│  ─ パターンオーバーレイ  │  AIシグナル確率     │
│               │  ─ フィボナッチ           │  ─ スパークライン   │
│  制限パネル   │  ─ RR サマリーバー        │                   │
│  ─ 残りトレード│                          │  経済カレンダー     │
│  ─ 損失率     │  インジケーターカード × 6  │  ─ 今後の指標      │
│  ─ 連敗数     │  MA / RSI / MACD / MTF   │                   │
│  ─ 規律スコア  │  BB / ATR                │  ファンダパネル     │
│               │                          │  ─ 金利差          │
│  PairsPanel   │  ファンダパネル（Col-2 下）│  ─ 経済指標        │
│  （マルチペア）│                          │  ─ NLP 感情        │
└───────────────┴──────────────────────────┴───────────────────┘
```

> **旧 `/pairs` マルチペア監視** の機能は Dashboard の `PairsPanel` コンポーネントへ統合した。

### 2.2 Command Bar 仕様（最重要コンポーネント）

```typescript
// apps/web/src/components/command-bar.tsx
interface CommandBarProps {
  entryState:     EntryState;
  score:          number;
  reasons:        string[];
  recommendation: string;
  aiProbability:  number;     // 0〜100
  direction:      'BUY' | 'SELL' | 'NEUTRAL';
  nextEventMin:   number;     // 次の重要指標まで（分）
  patternCount:   number;
}
```

| EntryState | 背景 | 行動指示テキスト | ボタン |
|-----------|------|--------------|-------|
| `ENTRY_OK` | 深緑 `#1A4A2E` | ✅ ENTRY OK | 緑・有効 |
| `SCORE_LOW` | 深黄 `#3A3010` | 🟡 WAIT | ロック（クリックで振動）|
| `RISK_NG` | 深赤 `#4A1010` | ⚠️ RISK NG | ロック |
| `LOCKED` | 深紺 `#1A1A2E` | 🔒 LOCKED | グレー・無効 |
| `COOLDOWN` | 深橙 `#3A1A00` | ⏳ COOLDOWN | タイマー表示 |

### 2.3 スコアパネル仕様

#### リングゲージ（SVG）

```typescript
// SVG 仕様
// viewBox: "0 0 120 120"
// 円: cx=60, cy=60, r=44, strokeWidth=8
// 円周: 2π × 44 ≈ 276.46
// strokeDashoffset = 276.46 × (1 - score / 100)
// 色: score >= 75 → #2EC96A / 50〜74 → #E8B830 / < 50 → #E05252
```

#### スコア内訳バー

| 表示ラベル | 満点 | バー色 |
|---------|------|-------|
| テクニカル | 40 | エントリー状態色に連動 |
| ファンダメンタル | 30 | 〃 |
| 市場安定性 | 10 | 〃 |
| RR レシオ | 10 | 〃 |
| パターンボーナス | +15 | `#F59E0B`（オレンジ固定・ボーナス識別）|

#### エントリーボタン振動アニメーション（CSS）

```css
@keyframes shake {
  0%,100% { transform: translateX(0); }
  20%     { transform: translateX(-6px); }
  40%     { transform: translateX(6px); }
  60%     { transform: translateX(-4px); }
  80%     { transform: translateX(4px); }
}
.btn-locked:active { animation: shake 0.4s ease; }
```

### 2.4 チャート SVG 仕様

> **PG-01 の ChartSvg はエントリー判断補助の簡易サマリーチャートである。**
> 詳細分析のための画面ではなく、Dashboard 上でのエントリー可否判断を補助する軽量表示が目的。
> 表示対象は限定された指標（MA50 / MA200 / Entry / SL / TP ライン・パターンオーバーレイ）のみとする。
>
> **PG-07 Chart の MainChart（Part10 §10.7・Part5 §8.7 参照）とは役割が異なる。**
> - `ChartSvg`（PG-01）: エントリー判断補助の簡易サマリーチャート。詳細確認の場ではない。
> - `MainChart`（PG-07）: 主分析画面の本格チャート。詳細確認・オーバーレイ精査・相場視覚精査の場。
>
> 見た目が類似していても意味と責務は異なる。UI統合・同一コンポーネント化を前提にしない。
> ワイヤーフレーム生成時に ChartSvg と MainChart を同一扱いしてはならない。

```
ローソク足: 過去 60 本（H4 デフォルト）
  陽線 fill: #2EC96A / 陰線 fill: #E05252
  各足幅: 8px, 間隔: 4px

ライン描画:
  ENTRY: stroke #2EC96A, strokeWidth 2, strokeDasharray なし
  SL:    stroke #E05252, strokeWidth 1.5, strokeDasharray "6 3"
  TP:    stroke #4D9FFF, strokeWidth 1.5, strokeDasharray "6 3"
  MA50:  stroke #4D9FFF, strokeWidth 1.5
  MA200: stroke #E8B830, strokeWidth 1, opacity 0.7
  Fib61.8%: stroke #B07EFF, strokeWidth 1, strokeDasharray "3 3"
  Fib38.2%: stroke #B07EFF, strokeWidth 1, strokeDasharray "3 3", opacity 0.5

パターンオーバーレイ:
  ダブルボトム検出エリア: fill rgba(46,201,106,0.06)
  ネックライン: stroke #2EC96A, strokeDasharray "8 4"
  パターンラベル: テキスト左上配置
```

### 2.5 インジケーターカード仕様

```typescript
// 6 枚 × 3×2 グリッド
interface IndicatorCard {
  id:         'ma' | 'rsi' | 'macd' | 'mtf' | 'bb' | 'atr';
  title:      string;
  score:      number;
  maxScore:   number;
  mainValue:  string;   // 例: "GC 確認" / "54.2" / "+0.0021"
  subText:    string;   // 例: "MA50 > MA200"
  statusLabel: string;  // 例: "📈 上昇優位"
  helpText:   string;   // ? ボタンのモーダル本文
  learnUrls:  { label: string; url: string }[];
}
```

解説モーダルは全 6 指標 × `?` ボタンで開く。モーダル構成:
1. WHAT（何を見る指標か）
2. CURRENT STATE（現在の状態・数値）
3. KEY LEVELS（警戒水準）
4. 📖 詳しく学ぶ（外部リンク 2〜3 件）

### 2.6 PairsPanel（旧 `/pairs` の統合先）

```typescript
// apps/web/src/components/dashboard/PairsPanel.tsx
interface PairCardProps {
  symbol:     string;
  price:      number;
  change:     number;      // 前日比 %
  score:      number;
  entryState: EntryState;
  direction:  'BUY' | 'SELL' | 'NEUTRAL';
  patterns:   string[];
  sparkline:  number[];    // 直近 20 本の終値
}
```

- 2×4 グリッド（最大 8 スロット。プラン別有効数: FREE=1 / BASIC=4 / PRO|PRO_PLUS|ADMIN=8）
- FREE は **1 ペアのみ**有効（残り 7 枚はプランバッジ + ぼかし表示）
- BASIC は **4 ペアまで**有効（残り 4 枚はプランバッジ + ぼかし表示）
- PRO / PRO_PLUS / ADMIN は **8 ペア全て**有効
- スパークライン: SVG で描画（60×24px 程度）

### 2.7 初心者モード専用表示（`<BegOnly>`）

- 青のインフォバナー: 「上のバーが今すぐの答えです」
- 次の行動ガイドカード（ステップ 1〜4 で何をすべきか明示）

```
ステップ 1: 今は待機（スコア 72 点 / 基準 75 点）
ステップ 2: CPI 発表 (21:30) を確認してから
ステップ 3: ダブルボトムが確定すれば自動で加点
ステップ 4: 75 点になったら通知 → その時だけエントリー検討
```

---

## 3. PG-02 トレード記録（Trades）

### 3.1 ページ概要

トレード記録・心理タグ・パフォーマンス分析を一元管理するページ。

旧 `/validation`（予測精度検証）の ValidationPanel を本ページ内に統合する。

```
表示構成:
  上段: KPI バナー（勝率 / 平均 RR / 損益合計 / 規律スコア）
  中段: 損益曲線（Equity Curve）+ 月次パフォーマンスサマリー
  中段: 心理バイアス分析グラフ × 3
  下段: 取引ログテーブル（直近 20 件）+ ValidationPanel
```

### 3.2 レイアウト

```
┌─────────────────────────────────────────────────────┐
│  KPI バナー（4 列）                                    │
│  勝率 / 平均 RR / 損益合計 / 規律スコア                │
├──────────────────────────┬──────────────────────────┤
│  損益曲線（Equity Curve）  │  月次パフォーマンスサマリー │
├──────────────────────────┴──────────────────────────┤
│  心理バイアス分析 / スコア帯別 / 時間帯別収益グラフ       │
├─────────────────────────────────────────────────────┤
│  取引ログテーブル（直近 20 件）                         │
│  エントリー理由 / 心理タグ / PnL / 振り返り             │
├─────────────────────────────────────────────────────┤
│  ValidationPanel（予測精度 — 旧 /validation 統合）     │
│  方向一致率 / MAE / 予測 PF / シャープレシオ            │
└─────────────────────────────────────────────────────┘
```

### 3.3 Trade CRUD

```typescript
// トレード記録操作
// POST   /api/v1/trades            ← 新規記録
// GET    /api/v1/trades            ← 一覧取得（フィルター・ページネーション）
// PATCH  /api/v1/trades/:id        ← 部分更新（exitPrice, note 等）
// POST   /api/v1/trades/:id/close  ← クローズ（exitTime / exitPrice / pnl 確定）
// POST   /api/v1/trades/:id/review ← 振り返り登録
// GET    /api/v1/trades/:id/review ← 振り返り取得
```

### 3.4 ValidationPanel（旧 `/validation` の統合先）

| KPI | 意味 | 目標値 |
|-----|------|-------|
| 方向一致率 | 予測方向と実際の方向一致率 | > 65% |
| 平均誤差 MAE | 平均絶対誤差（pips）| 低いほど良い |
| 予測 PF | 予測ベーストレードの損益比 | > 1.5 |
| シャープレシオ | 予測収益の安定性指標 | > 1.5 |

---

## 4. PG-03 ストラテジー（Strategy）

### 4.1 ページ概要

手法管理・パターン定義・Entry / Exit ルールを一元管理するページ。

旧 `/patterns`（チャートパターン分析）の機能は本ページ配下に統合する。

```
表示構成:
  上段: 手法カード一覧（登録済みストラテジー）
  中段: パターン定義一覧（フォーメーション / ローソク足）
  下段: Entry / Exit ルール設定 + フィボナッチ解説パネル
```

### 4.2 パターン定義（旧 `/patterns` の統合先）

```typescript
interface PatternCard {
  name:        string;
  category:    'formation' | 'candlestick';
  direction:   'BUY' | 'SELL' | 'BOTH';
  confidence:  number;     // 0.0〜1.0（現在検出状況）
  bonus:       number;     // スコア加算点
  detected:    boolean;    // 現在チャートで検出中か
  svgPreview:  string;     // パターン形状 SVG
  description: string;
  conditions:  string[];   // 検出条件箇条書き
  entryLogic:  string;     // エントリー根拠
  slLogic:     string;     // SL 設定根拠
  tpLogic:     string;     // TP 目標算出
  learnUrl:    string;
}
```

フォーメーションパターン（6 種）: ダブルボトム / H&S / トライアングル / フラッグ / カップハンドル / ライジングウェッジ

ローソク足パターン（6 種）: ピンバー / エンゴルフィング / 明けの明星 / シューティングスター / ドージ / 三兵

---

## 5. PG-04 MTF 予測（Prediction）（PRO | PRO_PLUS | ADMIN のみ）

### 5.1 v5.1 実装制約

> **Prediction Engine は v5.1 ではスタブ実装のみ。**
> DTW / HMM / 類似局面検索 / パターン AI はすべて v6 機能とする。
> v5.1 では STUB_PREDICTION_RESULT（Part 8 §9 準拠）の固定値を表示する。
> この境界を超える実装コードを v5.1 に含めてはならない。

### 5.2 レイアウト

```
┌─────────────────────────────────────────────────────┐
│  自己改善ループバナー（stub）                           │
│  AI予測 → 実際 → 誤差測定 → 学習 → 次回予測改善         │
├─────────────────────────────────────────────────────┤
│  [シンボル選択] [時間足] [予測実行ボタン] [ジョブ状態]    │
├────────────────────────┬────────────────────────────┤
│  左パネル               │  右パネル                   │
│  ─ MTF 重み設定（stub） │  ─ 予測チャート SVG（stub）  │
│    W1 / D1 / H4 / H1   │    3 シナリオ重ね描き          │
│    / M30 スライダー      │                             │
│  ─ 時間足整合マトリクス  │                             │
└────────────────────────┴────────────────────────────┘
│  AI シナリオテキスト（3 シナリオカード・stub）            │
│  強気 63% / レンジ 22% / 弱気 15%                      │
└─────────────────────────────────────────────────────┘
```

### 5.3 予測チャート SVG 仕様（stub）

```
現在価格 → 右方向に 3 シナリオを fan-out 描画
  強気シナリオ:   stroke #2EC96A, strokeWidth 2
  レンジシナリオ: stroke #E8B830, strokeWidth 1.5, strokeDasharray "8 4"
  弱気シナリオ:   stroke #E05252, strokeWidth 2

現在時点を示す縦線: stroke #FFFFFF, opacity 0.4
各シナリオ末端にラベル: 確率% + 想定 pips（固定値）
```

### 5.4 ジョブ状態表示

| JobStatus | UI 表示 |
|-----------|--------|
| `QUEUED` | ⏳ キューに追加済み |
| `RUNNING` | 🔄 計算中...（スピナー）|
| `SUCCEEDED` | ✅ 完了（stub 結果表示）|
| `FAILED` | ❌ エラー（再実行ボタン）|

TanStack Query で 5 秒ポーリング（QUEUED / RUNNING 中のみ）。

---

## 6. PG-05 設定（Settings）

### 6.1 タブ構成

| タブ | 内容 |
|------|------|
| リスク設定 | プリセット選択 / 個別パラメータ調整 |
| 機能スイッチ | AI シグナル / パターンボーナス / ニュースロック / 冷却タイマー / MTF 予測 |
| 強制ロック | ON/OFF トグル + 解除確認ダイアログ |
| 通貨ペア | 有効化 / 閾値個別設定 / デフォルト時間足 |
| データソース | 各コネクタの接続状態（✅ 正常 / ⚠️ キャッシュ / ❌ 障害）|

### 6.2 プリセット選択 UI

```
[conservative 85pt]  [standard 75pt ✓]  [aggressive 70pt]
                      ↑ 現在選択中

選択すると確認モーダル:
「standard プリセットを適用します。
  スコア閾値が 75 点、リスク率が 1.0% に変更されます。よろしいですか？」
[キャンセル] [適用]
```

---

## 7. PG-06 プラン（Plan）

### 7.1 ページ概要

サブスクリプションプランの確認・変更・課金管理を行うページ。

```
表示構成:
  上段: 現在のプラン表示 + 有効期限
  中段: プラン比較テーブル（FREE / BASIC / PRO / PRO_PLUS）
  下段: 支払い方法 / 請求履歴
```

### 7.2 プラン別機能対照表

| 機能 | FREE | BASIC | PRO | PRO_PLUS |
|------|:----:|:-----:|:---:|:--------:|
| 監視ペア数 | 1 | 4 | 8 | 8 |
| スナップショット/日 | 20 | 無制限 | 無制限 | 無制限 |
| AI 要約 | ✗ | 3 回/日 | 無制限 | 無制限 |
| MTF 予測（stub）| ✗ | ✗ | ✅ | ✅ |

---

## 8. PG-07 チャート分析（Chart）

> **⚠️ PG-07 Chart における正本分担（必読）**
>
> | 対象 | 正本 |
> |------|------|
> | PG-07 の画面レイアウト・表示セクション・コンポーネント構成 | **Part 10 §10**（唯一の正本）|
> | Chart 専用 API・レスポンス・キャッシュ・Chart 専用 DB テーブル | **Part 11**（唯一の正本）|
>
> - 本 Part（Part 5）§8 の記述は概要・補足にとどまる。PG-07 の UI 実装は必ず Part 10 §10 を参照すること。
> - **Part 11 は UI の正本ではない。** ワイヤーフレーム生成時に Part 11 を参照して UI を補完・推測してはならない。
> - 実装者は「UI を Part 10 から」「データ取得を Part 11 から」それぞれ読むこと。

### 8.1 ページ目的と役割定義

PG-07 Chart は **FXDE における主分析画面** である。

**PG-01 Dashboard の ChartSvg との役割区分（必須理解）:**

| コンポーネント | ページ | 役割 | 位置づけ |
|-------------|--------|------|---------|
| `ChartSvg` | PG-01 Dashboard | エントリー判断補助の簡易サマリーチャート | 詳細分析画面ではない。表示対象を絞った軽量表示 |
| `MainChart` | PG-07 Chart | 主分析画面の本格チャート | 詳細確認・オーバーレイ確認・相場視覚精査の場 |

> ワイヤーフレーム上で見た目が類似していても、意味と責務は異なる。
> Dashboard と Chart は UI 統合・同一コンポーネント化を前提にしない。
> ワイヤーフレーム生成時にこの2つを同一視してはならない。

| ページ | 役割 |
|--------|------|
| PG-01 Dashboard | 判断サマリー。今どうするか |
| PG-04 Prediction | 将来シナリオの確認 |
| **PG-07 Chart** | **現在の相場を視覚的に精査する** |

```
Dashboard（状況把握）→ Chart（視覚精査）→ Prediction（将来確認）
```

### 8.2 ページモード

| モード | 概要 | 強調表示 |
|--------|------|----------|
| `analysis` | 純粋相場分析モード | indicator / market structure 中心 |
| `trade` | トレード管理モード | entry / SL / TP / RR / active trade 情報中心 |

### 8.3 レイアウト構成（全体 3 段）

```
┌──────────────────────────────────────────────────────────────┐
│  [上段] chart-overview + chart-toolbar                        │
│  ペア / 時間足 / 価格 / ステータス / 操作ボタン群              │
├──────────────────────────────────────────────────────────────┤
│  [中段] main-chart                                            │
│  メインローソク足チャート（最大化）                             │
│  overlay: MA / BB / Fib / trendline / Entry / SL / TP        │
│           Prediction path / Trade markers / Pattern labels    │
├─────────────────────────────────┬────────────────────────────┤
│  [下段左]                        │  [下段右]                   │
│  indicator-summary               │  trade-overlay-panel        │
│  recent-signals                  │  prediction-overlay-panel   │
│  chart-notes                     │                             │
└─────────────────────────────────┴────────────────────────────┘
```

### 8.4 セクション構成（確定 8 セクション）

| # | セクション ID | 役割 |
|---|------------|------|
| 1 | `chart-overview` | ページ冒頭の概要情報 |
| 2 | `chart-toolbar` | チャート操作 UI |
| 3 | `main-chart` | メインチャート本体 |
| 4 | `indicator-summary` | 現在の指標状態カード群 |
| 5 | `trade-overlay-panel` | アクティブトレードの補助情報 |
| 6 | `prediction-overlay-panel` | Prediction overlay 補助（PRO stub）|
| 7 | `chart-notes` | トレーダーのメモ欄 |
| 8 | `recent-signals` | 直近シグナル一覧 |

### 8.5 chart-overview

| 要素 | 仕様 |
|------|------|
| ページ見出し | "Chart" ラベル |
| 現在ペア | 例: EUR/USD |
| 現在時間足 | 例: H1 |
| 現在価格 | 例: 1.0842 |
| spread | 例: Spread 0.3 |
| market status | 例: Open / Closed |
| session label | 例: London Open / Tokyo / NY |
| trend bias | 例: Trend: bullish |

### 8.6 chart-toolbar

| 要素 | 選択肢 |
|------|--------|
| pair selector | EUR/USD / USD/JPY / GBP/USD / AUD/USD |
| timeframe selector | W1 / D1 / H4 / H1 / M30 / M15 / M5 |
| chart type selector | Candles / Line / Area |
| indicator toggles | MA / RSI / MACD / BB / ATR / Fib / Trendline |
| overlay toggles | Entry・SL・TP / Prediction / Trade markers / Pattern labels |
| reset view / snapshot / fullscreen | — |

```typescript
type IndicatorToggle = 'MA' | 'RSI' | 'MACD' | 'BB' | 'ATR' | 'Fib' | 'Trendline';
type OverlayToggle = 'entry_sl_tp' | 'prediction' | 'trade_markers' | 'pattern_labels';
```

- 各トグルはオン / オフを視覚的に区別する（active state: bg accent）
- v5.1 では UI のみ実装。実チャートへの反映は v6。

### 8.7 main-chart

| 要素 | 仕様 |
|------|------|
| chart header | 現在ペア + 時間足 + 現在価格 |
| chart legend | 表示中オーバーレイ名一覧 |
| candlestick placeholder | h-[480px] 以上、border-dashed |
| price scale | 右端縦軸（プレースホルダー）|
| time scale | 下端横軸（プレースホルダー）|
| lower indicator pane | RSI / MACD 等の下段インジ領域（プレースホルダー）|

**必須表示オーバーレイラベル（placeholder 上に配置）:**

| ラベル | 色 |
|--------|-----|
| Entry | green（#2EC96A）|
| SL | red（#E05252）|
| TP | blue（#4D9FFF）|
| Prediction path | purple（#B07EFF）|
| Pattern tag | accent |

**将来実装候補（v6 以降）:** Lightweight Charts（TradingView 製 OSS）/ TradingView Widget / Custom SVG candle chart

### 8.8 indicator-summary

```typescript
interface IndicatorSummaryCard {
  id:     'ma' | 'rsi' | 'macd' | 'atr' | 'bb' | 'bias';
  label:  string;
  value:  string;
  status: 'bullish' | 'bearish' | 'neutral';
}
```

- 6 枚を 3×2 または 2×3 のグリッドで表示
- status に応じて文字色を変える（bullish=green / bearish=red / neutral=yellow）

### 8.9 trade-overlay-panel

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

- アクティブトレードなし時: "No Active Trade" プレースホルダー表示
- データは `GET /api/v1/trades?status=OPEN` から取得（TanStack Query）

### 8.10 prediction-overlay-panel

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

**v5.1 実装制約:**
- stub 表示のみ。固定値を表示する（STUB_PREDICTION_RESULT 参照）。
- PRO | PRO_PLUS | ADMIN のみ有効データを表示。
- FREE | BASIC ユーザーにはロックバッジ + PRO 誘導を表示する。

**ロール別表示仕様（確定）:**

| ロール | 表示 |
|--------|------|
| `PRO \| PRO_PLUS \| ADMIN` | stub データを表示（上記テーブルの値）|
| `FREE \| BASIC` | ロック状態 UI を表示（下記仕様に従う）|

**FREE / BASIC 向けロック状態 UI 仕様（必須 — ワイヤーフレームの描画対象）:**

> PG-07 ページ自体は `FREE | BASIC` もアクセス可能。
> `prediction-overlay-panel` セクションのみが制限対象であり、セクション自体を非表示にしない。
> 以下のロック状態 UI として描画する。

| 要素 | 仕様 |
|------|------|
| 🔒 ロックバッジ | セクション上部に目立つロックアイコン + バッジ |
| 利用可能ロール表記 | 「PRO / PRO_PLUS / ADMIN でご利用いただけます」の文言 |
| Upgrade 導線 | 「プランをアップグレード」リンクまたはボタン（`/plan` へ遷移）|
| コンテキスト説明 | 「このセクションのみ制限対象。チャート全体は引き続きご利用いただけます」の旨の文言 |
| コンテンツ領域 | 実データは非表示。代わりにロックオーバーレイ（ぼかし + バッジ）を表示 |

> **バックエンド制御:** `GET /api/v1/chart/prediction-overlay` は `FREE | BASIC` に HTTP 403 を返す（`RolesGuard`）。
> **フロント制御:** 403 受信時にロック状態 UI へ切り替える（ページ全体のアクセス拒否ではない）。
> バックエンドとフロントの両方で制御する（二重保護。Part 10 §1.2 準拠）。

### 8.11 chart-notes

| 要素 | 用途例 |
|------|--------|
| setup note | 「1.0840抜けで買い」 |
| invalidation note | 「CPI前なので見送り」 |
| memo textarea | 「下位足弱く待機」などの自由記述 |
| save placeholder button | 保存ボタン（v5.1 はプレースホルダー）|

- textarea の永続化は v5.1 ではプレースホルダー。v6 でトレード記録 CRUD と接続する。

### 8.12 recent-signals

| 列 | 内容 |
|----|------|
| time | 発生時刻（例: 09:20）|
| type | シグナル種別（例: MA cross / RSI divergence / BB breakout）|
| direction | BUY / SELL |
| score | スコア値（例: 78）|
| note | 備考（例: H1 確認済み）|

**データソース:** `GET /api/v1/signals?symbol={pair}&limit=10`（TanStack Query）

### 8.13 オーバーレイ要素一覧

**必須オーバーレイ:**

| 要素 | 色 | 種別 |
|------|-----|------|
| Entry line | `#2EC96A` | 実線 strokeWidth 2 |
| SL line | `#E05252` | 破線 strokeDasharray "6 3" |
| TP line | `#4D9FFF` | 破線 strokeDasharray "6 3" |
| MA50 | `#4D9FFF` | 実線 strokeWidth 1.5 |
| Pattern label | accent | テキストラベル |

**任意オーバーレイ（toolbar トグルで制御）:**

| 要素 | 色 | 種別 |
|------|-----|------|
| Fib 61.8% | `#B07EFF` | 破線 strokeDasharray "3 3" |
| Fib 38.2% | `#B07EFF` | 破線 opacity 0.5 |
| Trendline | `#E8B830` | 実線 |
| Prediction path | `#B07EFF` | 破線（PRO のみ）|
| Trade markers | `#2EC96A` / `#E05252` | 三角マーカー |
| Session zones | 半透明 fill | 背景ゾーン |

### 8.14 PG-07 API 連携

| 目的 | エンドポイント | 備考 |
|------|-------------|------|
| 現在価格・オーバービュー | `GET /api/v1/snapshots/latest?symbol={pair}` | 30 秒ポーリング |
| アクティブトレード | `GET /api/v1/trades?status=OPEN&symbol={pair}` | |
| 直近シグナル | `GET /api/v1/signals?symbol={pair}&limit=10` | |
| 予測 stub データ | `GET /api/v1/predictions/latest?symbol={pair}` | PRO のみ。v5.1 は stub |

---

## 9. フロント実装ガイド

### 9.1 ディレクトリ構成（web/src）

```
src/
├── pages/
│   ├── Dashboard.tsx
│   ├── Trades.tsx
│   ├── Strategy.tsx
│   ├── Prediction.tsx
│   ├── Settings.tsx
│   ├── Plan.tsx
│   ├── Chart.tsx
│   ├── Login.tsx
│   └── Register.tsx
├── components/
│   ├── layout/
│   │   ├── TopBar.tsx
│   │   ├── Sidebar.tsx
│   │   └── TickerBar.tsx
│   ├── dashboard/
│   │   ├── CommandBar.tsx
│   │   ├── ScorePanel.tsx
│   │   ├── ScoreRing.tsx          ← SVG リングゲージ
│   │   ├── ChartSvg.tsx           ← PG-01 Dashboard 用の簡易サマリーチャート（エントリー判断補助）
│   │   │                             ※ PG-07 Chart ページの MainChart とは役割が異なる
│   │   │                             ※ PG-07 の主分析チャートは Part10 §10 MainChart が唯一の正本である
│   │   ├── IndicatorCard.tsx
│   │   ├── IndicatorModal.tsx     ← ? ボタンのモーダル
│   │   ├── FundamentalPanel.tsx
│   │   ├── LimitPanel.tsx
│   │   ├── PairsPanel.tsx         ← 旧 /pairs の統合先
│   │   └── AiSummaryBox.tsx
│   ├── trades/
│   │   ├── TradeTable.tsx
│   │   ├── EquityCurve.tsx
│   │   ├── PsychologyPanel.tsx
│   │   └── ValidationPanel.tsx   ← 旧 /validation の統合先
│   ├── strategy/
│   │   ├── PatternCard.tsx
│   │   ├── PatternSvgPreview.tsx
│   │   └── StrategyCard.tsx
│   ├── prediction/
│   │   ├── PredictionChart.tsx    ← 3 シナリオ SVG（stub）
│   │   └── TfWeightSlider.tsx
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
│       ├── ScoreBadge.tsx         ← スコア帯カラー自動適用
│       ├── EntryStateChip.tsx
│       └── Disclaimer.tsx
├── hooks/
│   ├── useSnapshot.ts             ← TanStack Query: GET /snapshots
│   ├── useTrades.ts
│   ├── useSignals.ts
│   ├── usePredictionJob.ts        ← ポーリング付き
│   ├── useSettings.ts
│   └── useSymbols.ts
├── stores/
│   ├── auth.store.ts              ← accessToken / user
│   └── ui.store.ts                ← mode / theme / selectedSymbol
├── lib/
│   ├── api-client.ts              ← Axios インスタンス + インターセプター
│   ├── token-refresh.ts           ← 401 時の自動リフレッシュ
│   └── formatters.ts              ← 数値・日時フォーマット関数
└── main.tsx
```

### 9.2 型定義（PG-07 追加分）

```typescript
// packages/types/src/chart.ts
export interface ChartOverviewData {
  symbol:       string;
  timeframe:    Timeframe;
  currentPrice: number;
  spread:       number;
  marketStatus: 'open' | 'closed';
  session:      'tokyo' | 'london' | 'new_york' | 'overlap' | 'off';
  trendBias:    'bullish' | 'bearish' | 'neutral';
}

export interface IndicatorSummaryItem {
  id:     'ma' | 'rsi' | 'macd' | 'atr' | 'bb' | 'bias';
  label:  string;
  value:  string;
  status: 'bullish' | 'bearish' | 'neutral';
}

export type ChartMode = 'analysis' | 'trade';
export type IndicatorToggle = 'MA' | 'RSI' | 'MACD' | 'BB' | 'ATR' | 'Fib' | 'Trendline';
export type OverlayToggle = 'entry_sl_tp' | 'prediction' | 'trade_markers' | 'pattern_labels';
```

### 9.3 API クライアント設定

```typescript
// apps/web/src/lib/api-client.ts
import axios from 'axios';
import { useAuthStore } from '../stores/auth.store';

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL + '/api/v1',
  withCredentials: true,   // Cookie（RefreshToken）を自動送信
});

apiClient.interceptors.request.use(config => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

apiClient.interceptors.response.use(
  res => res,
  async error => {
    if (error.response?.status === 401 && !error.config._retry) {
      error.config._retry = true;
      const { data } = await apiClient.post('/auth/refresh');
      useAuthStore.getState().setAccessToken(data.accessToken);
      error.config.headers.Authorization = `Bearer ${data.accessToken}`;
      return apiClient(error.config);
    }
    return Promise.reject(error);
  },
);
```

### 9.4 TanStack Query 設定

```typescript
// apps/web/src/main.tsx
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime:        30_000,
      gcTime:          300_000,
      retry:           2,
      refetchOnWindowFocus: false,
    },
  },
});
```

### 9.5 Zustand Auth Store

```typescript
// apps/web/src/stores/auth.store.ts
interface AuthStore {
  accessToken: string | null;
  user: { id: string; email: string; role: UserRole } | null;
  setAccessToken: (token: string) => void;
  setUser: (user: AuthStore['user']) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthStore>(set => ({
  accessToken: null,   // ⚠️ localStorage には保存しない（セキュリティ要件）
  user: null,
  setAccessToken: token => set({ accessToken: token }),
  setUser: user => set({ user }),
  logout: () => set({ accessToken: null, user: null }),
}));
```

### 9.6 コーディング規約

| 項目 | 規約 |
|------|------|
| コンポーネント | 関数コンポーネント + React Hooks のみ。クラスコンポーネント禁止 |
| 型 | TypeScript strict: true。`any` 使用禁止 |
| CSS | Tailwind CSS ユーティリティクラスのみ。インライン style は最小限 |
| データフェッチ | TanStack Query 必須。useEffect 内での直接 fetch 禁止 |
| 状態管理 | サーバー状態は TQ / UI 状態は Zustand / ローカル状態は useState |
| エラー境界 | 各ページに `<ErrorBoundary>` を設置 |
| `dangerouslySetInnerHTML` | 使用禁止（XSS 対策）|
| `localStorage` | AT の保存に使用禁止。UI 設定（theme 等）は `uiPrefs` API 経由 |
| SVG チャート | `<svg>` インライン描画。外部チャートライブラリは Recharts のみ許可 |
| 遅延ロード | PG-04 は `React.lazy` + `Suspense` で遅延ロード |

---

## 10. テスト方針

### 10.1 テスト種別・カバレッジ目標

| 種別 | ツール | カバレッジ目標 | 対象 |
|------|--------|-------------|------|
| ユニットテスト | Jest | ≥ 80% | スコアエンジン・ロット計算・EntryDecision・フォーマッター |
| 統合テスト（API） | Jest + Supertest | 主要エンドポイント全件 | 各コントローラー |
| E2E テスト | Playwright | 主要フロー | ログイン / スコア確認 / トレード記録 |

### 10.2 ユニットテスト重点項目

```typescript
describe('calculateScore', () => {
  test('全指標最高値で 100 点になる', () => {
    expect(calculateScore(MAX_INPUT).total).toBe(100);
  });
  test('パターンボーナスが 100 を超えた場合 100 に正規化される', () => {
    expect(calculateScore(OVERFLOW_INPUT).total).toBeLessThanOrEqual(100);
  });
  test('RR < 1.0 の場合 RR 点 = 0', () => {
    const result = calculateScore({ ...BASE_INPUT, rr: 0.8 });
    expect(result.breakdown.rr).toBe(0);
  });
});

describe('evaluateEntryDecision', () => {
  test('forceLock=true なら LOCKED を最優先', () => {
    expect(evaluateEntryDecision({ ...CTX, forceLock: true, score: 90 }).status).toBe('LOCKED');
  });
  test('全条件クリアなら ENTRY_OK', () => {
    expect(evaluateEntryDecision(FULL_OK_CTX).status).toBe('ENTRY_OK');
  });
  test('スコア閾値未満なら SCORE_LOW', () => {
    expect(evaluateEntryDecision({ ...FULL_OK_CTX, score: 70, scoreThreshold: 75 }).status).toBe('SCORE_LOW');
  });
  test('優先順: forceLock > cooldown > eventLock > riskNg > scoreLow', () => {
    const ctx = { ...FULL_OK_CTX, forceLock: true, isCooldown: true };
    expect(evaluateEntryDecision(ctx).status).toBe('LOCKED');
  });
});

describe('calcLot', () => {
  test('USD/JPY 標準ケース', () => {
    const lot = calcLot({ balance: 500_000, riskPct: 1, slPips: 50, symbol: 'USDJPY', currentRate: 150 });
    expect(lot).toBeCloseTo(0.1, 1);
  });
  test('ロット数は小数点 2 桁切り捨て', () => {
    const lot = calcLot({ balance: 300_000, riskPct: 1, slPips: 47, symbol: 'USDJPY', currentRate: 150 });
    expect(lot.toString()).not.toContain('e');
    expect(String(lot).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(2);
  });
});
```

### 10.3 API 統合テスト重点項目

```typescript
describe('POST /auth/register', () => {
  it('正常登録 → 201 + accessToken', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: 'test@example.com', password: 'Password123!' });
    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeDefined();
    expect(res.headers['set-cookie']).toBeDefined();
  });

  it('重複メール → 409', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: 'dup@example.com', password: 'Password123!' });
    expect(res.status).toBe(409);
  });

  it('パスワード 12 文字未満 → 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: 'short@example.com', password: 'Pass1' });
    expect(res.status).toBe(400);
  });
});

describe('POST /snapshots/capture', () => {
  it('FREE ユーザー AI 要約 → 403', async () => {
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN');
  });
  it('BASIC ユーザー 3 回/日超過 → 429', async () => {
    expect(res.status).toBe(429);
    expect(res.body.error).toBe('RATE_LIMIT_EXCEEDED');
  });
});

describe('POST /predictions/jobs', () => {
  it('FREE / BASIC ユーザー → 403', async () => {
    const res = await authenticatedRequest(freeUser)
      .post('/api/v1/predictions/jobs')
      .send({ symbol: 'EURUSD', timeframe: 'H4' });
    expect(res.status).toBe(403);
  });
});
```

### 10.4 E2E テスト（Playwright）重点フロー

```typescript
test('ログイン → ダッシュボード表示', async ({ page }) => {
  await page.goto('/login');
  await page.fill('[data-testid="email"]', 'user@example.com');
  await page.fill('[data-testid="password"]', 'Password123!');
  await page.click('[data-testid="login-btn"]');
  await expect(page).toHaveURL('/dashboard');
  await expect(page.locator('[data-testid="command-bar"]')).toBeVisible();
});

test('スコア閾値未満 → エントリーボタンがロック', async ({ page }) => {
  await page.route('**/api/v1/snapshots/capture', route =>
    route.fulfill({ json: MOCK_SNAPSHOT_SCORE_70 }));
  await page.locator('[data-testid="capture-btn"]').click();
  const entryBtn = page.locator('[data-testid="entry-btn"]');
  await expect(entryBtn).toHaveAttribute('data-locked', 'true');
});

test('トレード記録 → /trades 一覧に表示', async ({ page }) => {
  await page.goto('/dashboard');
  await page.click('[data-testid="entry-btn"]');
  await page.fill('[data-testid="trade-size"]', '0.1');
  await page.click('[data-testid="trade-submit"]');
  await page.goto('/trades');
  await expect(page.locator('[data-testid="trade-row"]').first()).toBeVisible();
});
```

### 10.5 CI パイプライン

```yaml
# .github/workflows/ci.yml
name: CI

on: [push, pull_request]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint

  test-api:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_DB: fxde_test
          POSTGRES_USER: fxde
          POSTGRES_PASSWORD: fxde_pass
        ports: ["5432:5432"]
      redis:
        image: redis:7-alpine
        ports: ["6379:6379"]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter api prisma migrate deploy
        env:
          DATABASE_URL: postgresql://fxde:fxde_pass@localhost:5432/fxde_test
      - run: pnpm --filter api test:cov
        env:
          DATABASE_URL: postgresql://fxde:fxde_pass@localhost:5432/fxde_test
          REDIS_URL: redis://localhost:6379
          JWT_SECRET: test_secret_32chars_minimum_here
          JWT_REFRESH_SECRET: test_refresh_secret_32chars_here

  test-web:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter web test

  build:
    needs: [lint, test-api, test-web]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter api build
      - run: pnpm --filter web build
```

---

## 11. 環境変数一覧

### API（apps/api/.env）

```env
# DB
DATABASE_URL=postgresql://fxde:fxde_pass@localhost:5432/fxde_dev

# Redis
REDIS_URL=redis://localhost:6379

# JWT（最低 32 文字のランダム文字列）
JWT_SECRET=change_me_32chars_minimum_here_!
JWT_REFRESH_SECRET=change_me_refresh_32chars_here!
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# 外部 API
ALPHA_VANTAGE_KEY=your_key_here
FRED_API_KEY=your_key_here
NEWS_API_KEY=your_key_here
OANDA_API_KEY=              # オプション（未設定時は Alpha Vantage のみ使用）
OANDA_ACCOUNT_ID=           # オプション（OANDA_API_KEY と対で設定）
CALENDAR_PROVIDER=stooq     # stooq | trading_economics

# App
PORT=3001
FRONTEND_URL=http://localhost:5173
NODE_ENV=development

# Feature Flags
ENABLE_PREDICTION_SERVICE=false   # Prediction Service 接続
FEATURE_PREDICTION_ENABLED=true   # PG-04 表示制御（false でスタブ非表示）
```

### Web（apps/web/.env）

```env
VITE_API_URL=http://localhost:3001
```

---

## 12. CHANGELOG

```
v5.0.0 [本書作成] 2025-03-07
  - v4 設計書（ch01〜ch15）を統合・再構築
  - スコープを v5（NestJS + PostgreSQL + React SPA）に確定
  - フロントを React 18 に一本化（Vue 廃止）
  - データソースを公式 API 限定に確定
  - スコアエンジン・EntryDecision を packages/shared に一元化
  - Prisma Schema 完全版を確定（11 モデル）
  - REST API エンドポイント全件定義（DTO + バリデーション）
  - RBAC 5 ロール確定（FREE / BASIC / PRO / PRO_PLUS / ADMIN）
  - ペア数確定: FREE=1 / BASIC=4 / PRO=8 / PRO_PLUS=8
  - BullMQ ジョブ 6 キュー設計確定
  - スコア帯カラーコード・EntryState UI 色を確定値として固定
  - プリセット値（conservative / standard / aggressive）を定数化
  - ワイヤーフレームの正本を 1 本に統合（別ファイル参照）
  - テスト方針・CI パイプライン定義

v5.1.0 [Part1 正本・Part10 統合] 2025-03-09
  - ページ構成を 7 ページへ確定（Part 1 §9 正本に完全準拠）
    PG-01:/dashboard  PG-02:/trades  PG-03:/strategy
    PG-04:/prediction  PG-05:/settings  PG-06:/plan  PG-07:/chart
  - 廃止: /patterns・/validation・/pairs（7 ページ構成外）
  - Sidebar NAV_ITEMS を Part 1 §9a 確定版に統一
    順序: Dashboard → Trades → Strategy → Prediction → Chart → Settings → Plan
  - React Router 構成を Part 1 §9b 確定版に統一
  - PG-02 Trades に旧 /validation 機能（ValidationPanel）を統合
  - PG-03 Strategy に旧 /patterns 機能を統合
  - PG-01 Dashboard に旧 /pairs 機能（PairsPanel）を統合
  - §8 PG-07 チャート分析（8 セクション・overlay 仕様・API 連携）を追加
  - フロントディレクトリを Trades / Strategy / Plan ベースへ刷新
  - chart/ コンポーネント群を追加
  - 型定義 packages/types/src/chart.ts を追加
  - PG-04 Prediction に v5.1 制約を明記
    （Prediction Engine はスタブ実装のみ。DTW / HMM / WFV は v6）

変更手順:
  1. 本書（SPEC_v5_part*.md）を更新する
  2. このセクションに 1 行記録する
     形式: vX.Y.Z [変更内容] YYYY-MM-DD
  3. 変更を Claude Code / ChatGPT に入力する際は変更差分を明示する
```

---

## 13. ワイヤーフレーム正本の運用ルール

| 項目 | ルール |
|------|--------|
| 正本ファイル | `FXDE_v5_wireframe.html`（本仕様書と同梱）|
| 旧バージョン | `_archive/` フォルダへ退避（削除しない）|
| 変更方法 | 正本を直接編集 → CHANGELOG に記録 |
| AI 生成時 | 旧 HTML（v2 / v3 / v4 の複数ファイル）を混ぜて渡さない |
| 正本の役割 | **参照のみ**。実装は本 SPEC に従い React で再実装する |

---

*Part 5 完了 — SPEC-v5.1 全 10 Part 完結*

---

## 付録 : SPEC-v5.1 構成インデックス

| Part | 内容 |
|------|------|
| Part 1 | スコープ確定 / 技術スタック / アーキテクチャ / データソース / ページ構成正本 |
| Part 2 | ER 図 / Prisma Schema / テーブル定義 |
| Part 3 | API 設計（エンドポイント / DTO / バリデーション）|
| Part 4 | スコアエンジン / 状態遷移 / リスク管理 / 認証権限 / 非同期ジョブ |
| Part 5 | 画面仕様 / フロント実装ガイド / テスト方針 / CHANGELOG |
| Part 6 | チャートパターン / バックテスト |
| Part 7 | 心理分析 / 履歴ログ / 設定画面 |
| Part 8 | MTF 予測設計（v5.1=スタブ / v6=DTW 本実装）|
| Part 9 | SaaS 設計 / ロードマップ |
| Part 10 | PG-07 チャートページ完全設計 |
| WF | FXDE_v5_wireframe.html（正本ワイヤーフレーム 1 本）|
