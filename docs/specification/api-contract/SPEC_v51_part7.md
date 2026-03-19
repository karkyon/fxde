# FX Discipline Engine — 統合仕様書 v5.1
## SPEC-v5.1 / Part 7 : 心理分析 · マルチペア · 設定画面 完全仕様

> **ページ構成・PG 番号・パスの正本は Part 10 §1〜4 を参照すること。**
> 本 Part に記載された PG 番号はすべて Part 10 §4 の対照表に従う。

---

## 1. 心理分析パネル（PG-02 Trades + Psychology）

### 1.1 概要と設計思想

PG-02 Trades + Psychology（`/trades`）の下部に配置される心理分析コンポーネント群。  
トレードの数字だけでなく「**なぜ負けたか**」の心理的パターンを可視化する。  
本パネルの目的は「スコアを守ることの金銭的価値」を自分自身のデータで証明すること。

```
PG-02 ページ構成（正本: Part 5 §3.1）:
  上段: KPI バナー（勝率 / 平均 RR / 損益合計 / 規律スコア）
  中段: 損益曲線（Equity Curve）+ 月次パフォーマンスサマリー（2 列）
  中段: 心理バイアス分析グラフ × 3（時間帯別 / 連敗後勝率 / スコア帯別）
  下段: 取引ログテーブル（直近 20 件）+ ValidationPanel
  ※ 取引ログ行クリック → TradeReview（振り返り入力）をインライン展開
```

コンポーネント配置:

| コンポーネント | ファイル | 配置段 |
|-------------|--------|--------|
| KPI バナー | `components/trades/TradeKpiBanner.tsx` | 上段 |
| 損益曲線 | `components/trades/EquityCurve.tsx` | 中段左 |
| 月次サマリー | `components/trades/MonthlyStats.tsx` | 中段右 |
| 心理分析グラフ群 | `components/trades/PsychologyPanel.tsx` | 中段（分析グラフ行）|
| 取引ログテーブル | `components/trades/TradeList.tsx` | 下段 |
| 振り返り入力 | `components/trades/TradeReview.tsx` | 取引ログ行内展開 |
| ValidationPanel | `components/trades/ValidationPanel.tsx` | 下段（旧 /validation 統合）|
| トレード記録フォーム | `components/trades/TradeForm.tsx` | モーダルまたは右パネル |

> **TradeForm（記録フォーム）は常時表示ではなく、「新規記録」ボタン押下でモーダルまたはサイドパネルとして表示する。**
> ページの主役は分析ビュー（KPI・損益曲線・心理グラフ・ログテーブル）であり、CRUD は補助操作として位置づける。

---

### 1.2 損益曲線（Equity Curve）

#### Recharts データ仕様

```typescript
// apps/web/src/components/trades/EquityCurve.tsx

// API レスポンス型（GET /api/v1/trades/equity-curve）
interface EquityCurveResponse {
  labels:         string[];   // 取引日ラベル
  balance:        number[];   // 口座残高推移
  drawdown:       number[];   // ドローダウン（0 以下の値）
  startBalance:   number;
  currentBalance: number;
  totalPnl:       number;
  totalReturn:    number;     // %
  mdd:            number;     // %（マイナス値）
}

// Recharts 用データ点型（parallel arrays → object array に変換）
interface EquityCurvePoint {
  date:     string;   // labels[i]
  balance:  number;   // balance[i]
  drawdown: number;   // drawdown[i]
}

// API レスポンスを Recharts 用に変換
function toChartData(res: EquityCurveResponse): EquityCurvePoint[] {
  return res.labels.map((date, i) => ({
    date,
    balance:  res.balance[i],
    drawdown: res.drawdown[i],
  }));
}

// Recharts 設定
const chartConfig = {
  balance: {
    dataKey: 'balance',
    type:    'monotone' as const,   // Recharts の曲線補間
    stroke:  '#2EC96A',
    fill:    'rgba(46,201,106,0.08)',
  },
  drawdown: {
    dataKey: 'drawdown',
    type:    'monotone' as const,
    stroke:  '#E05252',
    fill:    'rgba(224,82,82,0.08)',
  },
};
```

#### タブ切替（表示期間）

| タブ | 期間 | データ粒度 |
|------|------|----------|
| 1M | 直近 1 ヶ月 | 日次 |
| 3M | 直近 3 ヶ月 | 週次集計 |
| 1Y | 直近 1 年 | 月次集計 |

#### API エンドポイント

```typescript
// GET /api/v1/trades/equity-curve?period=1M|3M|1Y
// 正式定義: Part 10 §6.8（集計・統計系）
```

---

### 1.3 月次パフォーマンスサマリー（2×2 グリッド）

| メトリクス | 値例 | 色分けルール |
|-----------|------|-----------|
| 総損益 | +¥38,000 | 正: `#2EC96A` / 負: `#E05252` |
| 勝率 | 61.5% | ≥60%: 緑 / 50〜59%: 黄 / <50%: 赤 |
| 取引回数 | 26 回 | 上限内: 緑 / 超過: 赤 |
| 最大 DD | −8.2% | <10%: 黄 / ≥15%: 赤 |

**規律警告バナー（毎回必ず表示する）**

```
⚠️ 規律違反の損失は遵守時の 1.46 倍
```

> このメッセージは条件によらず常に表示し、  
> 「ルールを守ることの価値」を繰り返し刷り込む。

---

### 1.4 心理分析グラフ 3 種

#### ① 時間帯別成績グラフ（横棒グラフ）

```typescript
// GET /api/v1/trades/stats/hourly
// 正式定義: Part 10 §6.8（集計・統計系）
interface HourlyStats {
  hour:    string;   // 例: "9-12時"
  winRate: number;   // 0〜100
  pnl:     number;   // 正負あり
  count:   number;   // サンプル数
}

// サンプルデータ（初期表示用 fallback）
const HOURLY_SAMPLE: HourlyStats[] = [
  { hour: '0-3時',   winRate: 48, pnl: -2400,  count: 8  },  // 薄商い
  { hour: '3-6時',   winRate: 44, pnl: -3100,  count: 5  },  // 最低
  { hour: '6-9時',   winRate: 55, pnl: +3200,  count: 12 },  // 東京開始
  { hour: '9-12時',  winRate: 61, pnl: +8400,  count: 24 },  // 東京最盛期
  { hour: '12-15時', winRate: 53, pnl: +1200,  count: 10 },  // 昼休み
  { hour: '15-18時', winRate: 58, pnl: +5600,  count: 18 },  // ロンドン開始
  { hour: '18-21時', winRate: 56, pnl: +4200,  count: 15 },  // ロンドン
  { hour: '21-24時', winRate: 64, pnl: +12800, count: 30 },  // NY・ロンドン重複 ← 最高
];
```

**理論的根拠（ツールチップ / モーダルで表示）**

```
ロンドン・NY 重複時間（21:00〜01:00 JST）:
  世界の FX 取引量の約 70% が集中
  流動性最高 → スプレッド最小 → スリッページ最小

東京深夜〜早朝（00:00〜07:00 JST）:
  薄商い → スプレッド拡大 → 不利
  フラッシュクラッシュが起きやすい時間帯
```

**活用方法（ProOnly）**: 勝率の低い時間帯を自動的にロック候補として表示（将来機能フラグ）。

---

#### ② 連敗後の勝率崩壊グラフ（折れ線グラフ）

```typescript
// GET /api/v1/trades/stats/consecutive-loss
// 正式定義: Part 10 §6.8（集計・統計系）
interface ConsecutiveLossStats {
  streak:       number;  // 0 = 通常、1 = 1 連敗後、...
  winRate:      number;  // その後のトレードの勝率
  sampleCount:  number;
}

// サンプルデータ
const STREAK_SAMPLE: ConsecutiveLossStats[] = [
  { streak: 0, winRate: 61.5, sampleCount: 200 },  // ベースライン
  { streak: 1, winRate: 58.2, sampleCount: 80  },
  { streak: 2, winRate: 52.7, sampleCount: 42  },
  { streak: 3, winRate: 44.1, sampleCount: 21  },  // ⚠️ 大幅低下
  { streak: 4, winRate: 38.6, sampleCount: 11  },  // 最悪
];
```

**心理的メカニズム（プロスペクト理論）の解説文**

```
人間は損失を利益の約 2 倍大きく感じる（カーネマン・損失回避バイアス）。
連敗後は「取り返したい」という感情が理性を上回り、
スコア未達でのリベンジエントリーを行う傾向がある。

このグラフは「3 連敗後は強制休憩が必要」であることを
自分自身のデータで証明する。
```

**警告表示（3 連敗以上の場合、赤バナーで表示）**

```
🔴 3 連敗後の勝率 = 平常時の 71.7%
→ 本日の取引を停止することを強く推奨します
```

---

#### ③ スコア帯別損益グラフ（棒グラフ）

```typescript
// GET /api/v1/trades/stats/by-score-band
// 正式定義: Part 10 §6.8（集計・統計系）
interface ScoreBandStats {
  band:        string;   // 例: "75-79"
  avgPnl:      number;   // 平均損益 / 回
  winRate:     number;   // 勝率 %
  tradeCount:  number;
}
```

**表示データとインサイト**

```
スコア帯 → 期待値 / 回:
  〜59 点:   平均 −¥1,240  ← マイナス期待値
  60〜69 点: 平均 +¥480
  70〜74 点: 平均 +¥1,120
  75〜79 点: 平均 +¥2,180  ← 閾値超え（標準プリセット）
  80〜89 点: 平均 +¥3,920
  90 点〜:   平均 +¥5,640
```

**金銭的価値の可視化（重要インサイト）**

```
75 点以上エントリーの期待値: +¥3,120 / 回
75 点未満エントリーの期待値: −¥320 / 回

月 20 回トレードの場合:
  全てルール遵守:    +¥62,400
  20% ルール違反:    +¥37,120
  差額: −¥25,280（ルール違反コスト）
```

> このグラフが「スコアを守ることの金銭的価値」を最も説得力を持って示す。  
> スコア閾値を下回った時に「このルールを守ると月 +¥25,280 です」と表示する。

---

### 1.5 エントリー理由ログ

#### ログ DB 構造（Trade + TradeReview の JOIN）

```typescript
// GET /api/v1/trades?include=review で返すフィールド
interface TradeLogEntry {
  id:          string;
  datetime:    string;  // ISO 8601
  symbol:      string;
  side:        TradeSide;
  score:       number;  // review.scoreAtEntry
  entryState:  EntryState;
  result:      'WIN' | 'LOSS' | 'OPEN';
  pnl:         number | null;
  disciplined: boolean;  // review.disciplined
  emotion:     string;   // review.psychology.emotion
  selfNote:    string;   // review.psychology.selfNote
  tags:        string[];
}
```

#### 表示スタイル

```
✅ 遵守トレード（disciplined: true）
  border-left: 3px solid #2EC96A;
  background: rgba(46,201,106,0.04);

❌ 違反トレード（disciplined: false）
  border-left: 3px solid #E05252;
  background: rgba(224,82,82,0.06);
  注記: "スコア未達でエントリー" / "感情的エントリー" など
```

#### 理由の定型入力候補（UI でサジェスト）

```typescript
// apps/web/src/lib/trade-reason-suggestions.ts
export const REASON_SUGGESTIONS = {
  technical: [
    'MA ゴールデンクロス確認',
    'RSI 売られすぎから反発',
    'MACD シグナルライン上抜け',
    'ダブルボトム ネックライン上抜け',
    'ピンバー確認（H4）',
    'フラッグブレイク確認',
  ],
  fundamental: [
    'NFP 結果が予想を大幅上回る',
    'FOMC タカ派発言',
    'CPI 予想超え → USD 買い',
    '金利差拡大（USD 有利）',
  ],
  violation: [
    '感情的（損失取り返し）',
    'FOMO（乗り遅れ恐怖）',
    'スコア未達でエントリー',
    '指標前ロック中にエントリー',
  ],
};
```

---

### 1.6 取引ログテーブル

#### カラム定義

| カラム | 内容 | 特記 |
|--------|------|------|
| 日時 | YYYY/MM/DD HH:mm | ソートキー |
| ペア | EURUSD 等 | |
| 方向 | BUY / SELL | バッジ（緑 / 赤）|
| スコア | エントリー時スコア | 75 未満は赤ハイライト |
| RR | 実現 RR 比 | <1.0 は赤 |
| 結果 | WIN / LOSS / OPEN | バッジ |
| 損益 | +¥3,200 等 | 正: 緑 / 負: 赤 |
| 規律 | ✅ / ❌ | 違反は赤アイコン |
| 操作 | 詳細 / 振り返り入力 | |

#### ページネーション

- デフォルト 20 件 / ページ
- `GET /api/v1/trades?page=1&limit=20&sortBy=entryTime&sortOrder=desc`

---

### 1.7 心理バイアス一覧と対応機能

| バイアス名 | 内容 | 本システムの対応機能 |
|-----------|------|------------------|
| 損失回避バイアス | 損失を利益の約 2 倍大きく感じる（プロスペクト理論）| 連敗後の強制クールダウンタイマー |
| FOMO（機会損失恐怖） | 相場に乗り遅れることへの恐怖 | スコアロックで物理的に防止 |
| 確証バイアス | 自分の仮説に合う情報のみ参照 | 全指標のスコア化で客観化 |
| ギャンブラーの誤謬 | 連敗後は勝つはずという思い込み | 連敗後勝率データの可視化 |
| アンカリング | 最初に見た価格に引きずられる | ATR ベース SL/TP の客観的計算 |
| オーバーコンフィデンス | 自信過剰 → リスク過大 | スコア閾値による強制待機 |
| サンクコスト | 損失ポジションを持ち続ける | 日次損失上限によるクールダウン |
| 近接性バイアス | 直近の結果に過剰反応 | 時系列グラフで統計的に示す |

---

## 2. マルチペア監視パネル（PG-01 Dashboard 統合機能）

> **旧 Pairs ページ（`/pairs`）は廃止。**  
> 本節の機能は PG-01 Dashboard（`/dashboard`）下部の `PairsPanel` コンポーネントとして統合されている。  
> 正本: Part 10 §1.1 旧ページ名の廃止宣言。  
> 実装ファイル: `apps/web/src/components/dashboard/PairsPanel.tsx`

### 2.1 パネル全体レイアウト

```
┌──────────────────────────────────────────────────────────┐
│  フィルターバー                                             │
│  [ソート: スコア順▼] [フィルター: ENTRY_OKのみ] [BUYのみ]  │
│  [パターン検出あり] [リセット]                              │
├──────────────────────────────────────────────────────────┤
│  2×4 グリッド（8 ペアカード）                              │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                    │
│  │EURUSD│ │USDJPY│ │GBPUSD│ │USDCHF│                    │
│  └──────┘ └──────┘ └──────┘ └──────┘                    │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                    │
│  │AUDUSD│ │NZDUSD│ │USDCAD│ │XAUUSD│                    │
│  └──────┘ └──────┘ └──────┘ └──────┘                    │
├──────────────────────────────────────────────────────────┤
│  相関マトリクス（ProOnly）                                  │
└──────────────────────────────────────────────────────────┘
```

### 2.2 通貨ペアカード 完全仕様

```typescript
// apps/web/src/components/dashboard/PairsPanel.tsx

interface PairCardProps {
  symbol:      string;
  price:       number;
  change:      number;      // 前日比 %
  score:       number;
  entryState:  EntryState;
  direction:   'BUY' | 'SELL' | 'NEUTRAL';
  patterns:    string[];    // 検出中パターン名
  sparkline:   number[];    // 直近 20 本の終値（正規化済み 0〜1）
  maStatus:    'bullish' | 'bearish' | 'neutral';
  rsiValue:    number;
  fundaScore:  number;      // 0〜30
  starRating:  number;      // 1〜5（総合評価）
  userRole:    UserRole;    // ロール別有効スロット: FREE=1(2〜8ぼかし) / BASIC=4(5〜8ぼかし) / PRO|PRO_PLUS|ADMIN=8(全表示)
}
```

#### カードレイアウト

```
┌───────────────────────────────┐
│  EURUSD  ★★★★☆              │
│  1.0842  +0.12%               │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━  │  ← スパークライン
│  スコア: 78  📈 BUY           │
│  [ENTRY_OK]                   │
│  🔷 ダブルボトム検出中          │
│  MA: bullish / RSI: 54.2      │
└───────────────────────────────┘

FREE ユーザー（スロット 2〜8）:
┌───────────────────────────────┐
│  ████████████████████████     │  ← ぼかし表示
│     PRO プランで解除           │
│  [アップグレード]               │
└───────────────────────────────┘
```

#### プランバッジ + ぼかし表示

```typescript
// FREE=1(2〜8 ぼかし) / BASIC=4(5〜8 ぼかし) / PRO|PRO_PLUS|ADMIN=8(全表示)
// ぼかし: CSS filter: blur(4px) + 上に ProOnly オーバーレイ
```

#### スパークライン SVG 描画

```typescript
// apps/web/src/components/common/Sparkline.tsx
function Sparkline({ data, width=60, height=24, color='#2EC96A' }) {
  if (!data || data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const norm = (v: number) => ((v - min) / (max - min || 1));

  const step = width / (data.length - 1);
  const points = data.map((v, i) =>
    `${i * step},${height - norm(v) * height}`
  ).join(' ');

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
```

### 2.3 ソート・フィルター仕様

```typescript
// ソート選択肢
type SortOption = 'score_desc' | 'score_asc' | 'change_desc' | 'change_asc';

// フィルター選択肢（複数選択可）
interface PairFilter {
  entryOkOnly:      boolean;  // ENTRY_OK のみ
  directionFilter:  'BUY' | 'SELL' | null;  // null = 全方向
  patternOnly:      boolean;  // パターン検出あり
  minScore:         number;   // 最低スコア（default: 0）
}
```

### 2.4 通貨相関マトリクス（ProOnly）

```typescript
// GET /api/v1/symbols/correlation?period=30d（PRO | PRO_PLUS | ADMIN）
// 相関係数 −1.0〜+1.0
interface CorrelationMatrix {
  symbols: string[];
  matrix:  number[][];  // matrix[i][j] = symbol[i] と symbol[j] の相関係数
}

// 色定義
// +0.8 〜 +1.0: 濃赤（強い正の相関）  同時エントリー危険
// +0.5 〜 +0.8: 薄赤
//  0.0 〜 +0.5: 白
// −0.5 〜  0.0: 薄緑
// −0.8 〜 −0.5: 中緑
// −1.0 〜 −0.8: 濃緑（強い逆相関） ヘッジとして使える
```

---

## 3. 設定画面（PG-05 Settings 完全仕様）

> **PG-05 Settings（`/settings`）の完全仕様。**  
> 正本: Part 10 §4 PG 番号対照表。

### 3.1 タブ構成

```
設定ページ（PG-05 / /settings）
  ├── Tab 1: リスク設定
  │     ├── プリセット選択（3 種）
  │     └── 個別パラメータ（スライダー）
  ├── Tab 2: 機能スイッチ
  ├── Tab 3: 強制ロック
  ├── Tab 4: 通貨ペア
  ├── Tab 5: データソース接続状態
  └── Tab 6: 冷却タイマー
```

---

### 3.2 Tab 1: リスク設定

#### プリセット選択 UI

```tsx
// apps/web/src/components/settings/RiskPresetSelector.tsx
const PRESETS = [
  {
    id: 'conservative',
    icon: '🛡',
    label: '保守型',
    scoreThreshold: 85,
    maxRiskPct: 0.5,
    maxDailyLossPct: 1.5,
    maxStreak: 2,
    cooldownMin: 60,
    description: '資産保全最優先。エントリー機会は少ないが損失も小さい',
  },
  {
    id: 'standard',
    icon: '⚖',
    label: '標準型',
    scoreThreshold: 75,
    maxRiskPct: 1.0,
    maxDailyLossPct: 3.0,
    maxStreak: 3,
    cooldownMin: 30,
    description: 'バランス型。ほとんどのトレーダーに推奨',
  },
  {
    id: 'aggressive',
    icon: '🔥',
    label: '積極型',
    scoreThreshold: 70,
    maxRiskPct: 2.0,
    maxDailyLossPct: 6.0,
    maxStreak: 5,
    cooldownMin: 15,
    description: '高リターン志向。十分な経験がある上級者向け',
  },
];
```

**プリセット選択カード UI**

```
┌────────────────────────┐
│  🛡 保守型              │  ← 現在選択中（border: 2px solid #2EC96A）
│  閾値 85 / リスク 0.5%  │
│  ────────────────────  │
│  資産保全最優先          │
└────────────────────────┘
```

**プリセット適用確認モーダル**

```
「標準型プリセットを適用します。

  変更内容:
    スコア閾値:   85 → 75 点
    リスク率:    0.5% → 1.0%
    最大 DD:    1.5% → 3.0%
    連敗上限:     2 → 3 回
    冷却時間:    60 → 30 分

  ※ 個別に上書きした設定はリセットされます。」

[キャンセル]  [適用する]
```

#### 個別パラメータ スライダー仕様

```typescript
// 各スライダーの仕様
const SLIDER_CONFIGS = [
  {
    key:      'scoreThreshold',
    label:    'スコア閾値',
    min:      50, max: 95, step: 1, unit: '点',
    help:     'この点数以上でのみエントリーを許可します',
    dangerAt: 65,    // 65 未満は赤警告
  },
  {
    key:      'maxRiskPct',
    label:    '1 取引リスク率',
    min:      0.1, max: 5.0, step: 0.1, unit: '%',
    help:     '1 回のトレードで失ってよい口座残高の割合',
    dangerAt: 2.1,   // 2.1% 超は赤警告
  },
  {
    key:      'maxDailyLossPct',
    label:    '1 日最大損失',
    min:      0.5, max: 10.0, step: 0.5, unit: '%',
    help:     'この損失に達した日はクールダウンが発動します',
    dangerAt: 5.1,
  },
  {
    key:      'maxStreak',
    label:    '最大連敗数',
    min:      1, max: 10, step: 1, unit: '回',
    help:     '連敗がこの回数に達したらクールダウンが発動します',
    dangerAt: 6,
  },
  {
    key:      'maxTrades',
    label:    '1 日最大取引回数',
    min:      1, max: 10, step: 1, unit: '回',
    help:     'この回数を超えると当日のエントリーが禁止されます',
    dangerAt: null,
  },
  {
    key:      'cooldownMin',
    label:    '冷却時間',
    min:      5, max: 180, step: 5, unit: '分',
    help:     'クールダウン発動時にエントリーが禁止される時間',
    dangerAt: null,
  },
  {
    key:      'atrMultiplier',
    label:    'ATR 係数（SL 幅）',
    min:      1.0, max: 3.0, step: 0.1, unit: '×',
    help:     'ATR × この係数が SL の幅になります（大きいほど SL が広い）',
    dangerAt: null,
  },
] as const;
```

---

### 3.3 Tab 2: 機能スイッチ

| 機能 | デフォルト | 説明 |
|------|-----------|------|
| AI シグナル表示 | ON | AI 確率パネルの表示 |
| パターンボーナス加算 | ON | チャートパターン検出のスコア加算 |
| 指標前自動ロック | ON | 重要指標 30 分前〜15 分後の強制ロック |
| 冷却タイマー | ON | 損失後の強制クールダウン |
| NLP ニュース分析 | ON | ファンダスコアへの感情分析適用 |
| 上位足チェック（MTF）| ON | MTF 整合性のスコア評価 |
| 音声アラート | OFF | スコア達成時の通知音（ブラウザ音声 API）|
| 規律違反記録 | ON | スコア未達エントリーの自動記録 |
| MTF 予測機能 | ON（PRO \| PRO_PLUS \| ADMIN のみ有効）| PG-04 Prediction ページを表示 |

**オフ時の動作**

```typescript
// featureSwitches の各フラグが false の時の動作
{
  aiSignal:      → AIシグナル確率パネルを非表示（スコア計算には影響しない）
  patternBonus:  → パターンボーナス点を 0 にする（検出自体は継続）
  newsLock:      → 指標前後も LOCKED にしない
  cooldownTimer: → クールダウン条件を無視する（慣れたユーザー向け）
  mtfPrediction: → PG-04 をサイドバーから非表示（UI 非表示のみ）
                    ※ ルートアクセス制御（PredictionGuard）および
                       バックエンド RolesGuard による RBAC は本スイッチに関わらず常時有効。
                       機能スイッチ OFF は「PRO ユーザーが自分で非表示にする」UI 制御であり、
                       非 PRO ユーザーのアクセス拒否は RBAC が担保する。
}
```

---

### 3.4 Tab 3: 強制ロック

```typescript
// apps/web/src/components/settings/ForceLockPanel.tsx
```

**UI 仕様**

```
┌──────────────────────────────────────────────┐
│  🔒 強制ロック                                 │
│                                              │
│  OFF ──────────── [  ] ──── ON               │
│                                              │
│  ── 有効化すると ──────────────────────────── │
│  ・全ペアのエントリーボタンを無効化              │
│  ・解除には確認ダイアログが必要                  │
│                                              │
│  ── 使用シナリオ ──────────────────────────── │
│  ✓ 重大な経済危機・ブラックスワン発生時          │
│  ✓ 旅行中・集中できない環境                     │
│  ✓ 連続ルール違反が続いている時期の自己制御       │
└──────────────────────────────────────────────┘
```

**解除確認モーダル（意図的に煩わしくする）**

```
「🔒 強制ロックを解除しますか？

  本当に今すぐエントリーできる状態ですか？
  冷静な判断ができていますか？

  解除後は全ペアのエントリーが許可されます。」

[キャンセル（推奨）]  [解除する]
```

---

### 3.5 Tab 4: 通貨ペア設定

#### テーブル表示

| ペア | 有効 | 時間足 | 個別閾値 |
|------|:----:|--------|---------|
| EURUSD | ✅ | H4 ▼ | — （UserSetting 使用）|
| USDJPY | ✅ | H4 ▼ | 80 点 |
| GBPUSD | ✅ | D1 ▼ | — |
| XAUUSD | ❌ | H4 ▼ | — |

```typescript
// PATCH /api/v1/symbols/:symbol
// 各行でリアルタイム更新（debounce 500ms）
```

---

### 3.6 Tab 5: データソース接続状態

```typescript
// GET /api/v1/connectors/status
// 正式定義: Part 3 §12
interface ConnectorStatus {
  name:       string;
  type:       'price' | 'calendar' | 'news' | 'interest';
  status:     'ok' | 'cached' | 'error' | 'unconfigured';
  lastSyncAt: string | null;
  message:    string;
}
```

**UI 表示**

```
データソース接続状態:

✅ Alpha Vantage（FX 価格 / 主）     最終: 2 分前
⚠️ OANDA API（FX 価格 / 副）         キャッシュ使用中
✅ FRED API（経済指標）              最終: 15 分前
✅ NewsAPI.org（ニュース感情）        最終: 1 時間前
❌ Stooq（経済カレンダー）            接続エラー: タイムアウト
    [再接続を試みる]

──────────────────────────────────
⚠️ Stooq に接続できません。
   経済カレンダーデータが更新されていない可能性があります。
   指標前ロック機能が正しく動作しない場合があります。
```

---

### 3.7 Tab 6: 冷却タイマー

**UI 仕様**

```
┌──────────────────────────────┐
│  冷却タイマー                  │
│                              │
│      ██ 27:44 ██             │  ← DM Mono 36px / 赤色
│   カウントダウン中              │
│                              │
│  発動理由: 3 連敗              │
│  残り: 27 分 44 秒            │
│                              │
│  [タイマーをリセット（確認）]   │  ← 意図的に小さく・目立たなく
└──────────────────────────────┘

// 残り 0 秒の場合:
│      ✅ 取引可能               │  ← 緑色テキスト
```

**タイマーリセット確認モーダル**

```
「冷却タイマーを手動でリセットしますか？

  冷却タイマーはルール違反を防ぐために存在します。
  リセットすると、記録に「強制リセット」が残ります。

  本当に冷静な状態ですか？」

[キャンセル]  [リセット（記録に残る）]
```

---

## 4. Plan / Upgrade ページ（PG-06 概要）

> **PG-06 Plan / Upgrade（`/plan`）の詳細仕様は Part 9 §5 を参照。**  
> 本節は Part 7 内で参照される箇所との接続情報のみ記録する。

```
PG-06 の役割:
  ・FREE → BASIC / PRO / PRO_PLUS へのアップグレード誘導
  ・PRO 限定機能（PG-04 Prediction / 相関マトリクス 等）への案内
  ・プランごとの機能比較テーブル表示

v5.1 における課金処理:
  ・Stripe 連携は v7 対象
  ・v5.1 では UserRole enum による手動制御
  ・plans / subscriptions テーブルは v5.1 に存在しない（Part 10 §7.1 参照）
```

---

## 5. 集計・統計 API 一覧（本 Part 使用エンドポイント）

> 正本: Part 10 §6.8（集計・統計系）

| Method | Path | 説明 | 使用箇所 |
|--------|------|------|---------|
| GET | `/api/v1/trades/equity-curve` | 損益曲線 | §1.2 |
| GET | `/api/v1/trades/stats/summary` | 月次サマリー（KPI バナー用）| §1.3 |
| GET | `/api/v1/trades/stats/hourly` | 時間帯別成績 | §1.4 ① |
| GET | `/api/v1/trades/stats/consecutive-loss` | 連敗後勝率推移 | §1.4 ② |
| GET | `/api/v1/trades/stats/by-score-band` | スコア帯別損益 | §1.4 ③ |
| GET | `/api/v1/symbols/correlation` | ペア相関マトリクス（PRO）| §2.4 |
| GET | `/api/v1/connectors/status` | データソース接続状態 | §3.6 |

---

*SPEC-v5.1 Part 7 完了*  
*Part 8: MTF 予測設計（v5.1 = スタブ実装のみ / DTW・HMM・類似検索は v6 設計資料）*
