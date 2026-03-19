# FX Discipline Engine — 統合仕様書 v5.1
## SPEC-v5.1 / Part 11 : Chart API · Chart 専用 DB 完全設計（正本）

> **単一真実の原則（Single Source of Truth）**
> 本 Part（SPEC_v51_part11_chart_api.md）は、PG-07 Chart ページの
> Chart 専用 API（`/api/v1/chart/*`）および Chart 専用 DB テーブル 4 種の
> **唯一の正本** である。
>
> Part 2 §6.2・Part 10 §7.2・Part 10 §10.15 は本 Part の存在と役割のみを記録する。
> 実装時は本 Part を参照すること。
>
> 本 Part に記述のない仕様は「未定義 ＝ 実装しない」。
>
> **v5.1 と v6 の機能境界は本 Part §9 を必ず確認すること。**

---

## 1. Part 11 役割

### 1.1 本 Part が正本とするもの

| 対象 | 正本 |
|------|------|
| Chart 専用 API エンドポイント（`/api/v1/chart/*`）| **本 Part §3** |
| Chart 専用 DB テーブル（4 種）| **本 Part §5・§6** |
| Chart API キャッシュ戦略 | **本 Part §4** |
| PG-07 Chart ページとの API 対応表 | **本 Part §8** |
| v5.1 / v6 機能境界（Chart 機能に限定）| **本 Part §9** |

### 1.2 本 Part が対象外とするもの

以下は本 Part の対象外である。当該 Part を参照すること。

| 対象外 | 参照先 |
|--------|--------|
| PG-07 Chart ページ UI・レイアウト・セクション仕様 | Part 10 §10 |
| コア DB テーブル（users / trades / snapshots 等）| Part 2 |
| 既存 API（`/api/v1/snapshots` 等）| Part 3 |
| Prediction スタブの詳細仕様（STUB_PREDICTION_RESULT）| Part 8 §9 |
| チャートパターン 12 種の検出アルゴリズム・パターン名正本 | **Part 6 §1.0〜§1.3** |
| RBAC 総合定義・ロール一覧 | Part 1 §0 |

> **⚠️ 本 Part（Part 11）は PG-07 の UI 構造に関する決定権を持たない。**
>
> 本 Part が定義するのは Chart 専用 API のレスポンス形式・DB テーブル定義・キャッシュ戦略に限る。
> PG-07 のレイアウト・セクション配置・コンポーネント構成は Part 10 §10 が唯一の正本である。
>
> - ワイヤーフレームを生成する際は本 Part（Part 11）を参照して UI を補完・推測してはならない。
> - API のレスポンスフィールドからセクションの有無・位置・見た目を推定してはならない。
> - UI の根拠として使用できるのは Part 10 §10 のみである。

### 1.2a Part 10 の旧表記に関する読み替え宣言

> **⚠️ 読み替えルール（Part 10 との相互整合）**
>
> Part 10 §13 インデックス表の `Part 11` 行には以下の旧表記が残存している:
>
> ```
> 旧表記: `/api/chart/` エンドポイント・Chart 専用テーブル 4 種
> ```
>
> これは本 Part（Part 11）が確定する前に記載されたものであり、誤りである。
> **正しくは `/api/v1/chart/` エンドポイント** である（Part 1 §0-17 API バージョン規則準拠）。
>
> 同様に Part 10 §13 の注記:
> ```
> 旧表記: Chart 専用 API（`/api/chart/` 系、§10.15 参照）
> ```
> も **`/api/v1/chart/` 系** に読み替えること。
>
> **本 Part §3 の定義（`/api/v1/chart/*`）が唯一の正本であり、Part 10 の旧表記はすべて本 Part の定義で上書きする。**

### 1.3 NestJS モジュール配置

```
apps/api/src/
└── chart/                        ← Chart 専用モジュール
    ├── chart.module.ts
    ├── chart.controller.ts
    ├── chart.service.ts
    └── dto/
        ├── chart-candles.query.dto.ts
        ├── chart-indicators.query.dto.ts
        ├── chart-trades.query.dto.ts
        ├── chart-pattern-markers.query.dto.ts
        └── chart-prediction-overlay.query.dto.ts
```

---

## 2. Chart API 設計

### 2.1 基本方針

| 項目 | 方針 |
|------|------|
| ベース URL | `/api/v1/chart` |
| HTTP メソッド | すべて `GET`（読み取り専用）|
| 認証 | Bearer Token（AccessToken）必須 |
| レスポンス形式 | JSON（`Content-Type: application/json`）|
| バリデーション | `packages/types` Zod Schema 派生 DTO（`createZodDto`）|
| エラー形式 | Part 3 §15 統一エラーレスポンス形式準拠 |
| API バージョン | `/api/v1` のみ（`/api/chart/*` は使用禁止）|

> **命名規則厳守**: Chart API は `/api/v1/chart/*` に統一する。
> `/api/chart/*`（バージョン接頭辞なし）は絶対に使用しない（Part 1 §0-17 準拠）。

### 2.2 エンドポイント一覧

| エンドポイント | 役割 | アクセス権限 |
|-------------|------|------------|
| `GET /api/v1/chart/meta` | ペア・時間足・価格・セッション概要 | 全ロール |
| `GET /api/v1/chart/candles` | ローソク足 OHLCV データ | 全ロール |
| `GET /api/v1/chart/indicators` | インジケーター計算結果 | 全ロール |
| `GET /api/v1/chart/trades` | アクティブトレード情報（PG-07 向け）| 全ロール |
| `GET /api/v1/chart/pattern-markers` | チャートパターン検出マーカー | 全ロール ※ロール別フィルタあり |
| `GET /api/v1/chart/prediction-overlay` | 予測 overlay stub | `PRO \| PRO_PLUS \| ADMIN` のみ |

> **権限表記ルール（Part 1 §0-13 準拠）**: 「PRO以上」等の曖昧表現は禁止。
> 具体的なロール名（`FREE` / `BASIC` / `PRO` / `PRO_PLUS` / `ADMIN`）または
> `PRO | PRO_PLUS | ADMIN` のように列挙する。

### 2.3 Zod Schema / DTO 設計規則

```
packages/types/src/schemas/chart.schema.ts
  └── 全 Chart API クエリパラメータの Zod Schema（正本）

apps/api/src/chart/dto/*.query.dto.ts
  └── createZodDto(ChartXxxQuerySchema) 派生のみ
      @IsString() 等 class-validator デコレータ手書き禁止
```

---

## 3. API エンドポイント詳細

### 3.1 GET /api/v1/chart/meta

**役割:** ペア・時間足・現在価格・スプレッド・マーケット状態・セッション情報を返す。
PG-07 `chart-overview` セクションのデータソース。

**アクセス権限:** 全ロール（`FREE | BASIC | PRO | PRO_PLUS | ADMIN`）

**クエリパラメータ:**

| パラメータ | 型 | 必須 | 説明 | 例 |
|-----------|------|:----:|------|-----|
| `symbol` | string | ✅ | 通貨ペア | `EURUSD` |
| `timeframe` | Timeframe | ✅ | 時間足 | `H1` |

> `Timeframe` は Part 2 Prisma enum 準拠: `M1 | M5 | M15 | M30 | H1 | H4 | H8 | D1 | W1 | MN`

**Zod Schema（正本）:**

```typescript
// packages/types/src/schemas/chart.schema.ts

import { z } from 'zod';
import { TimeframeSchema } from './common.schema'; // Part 2 Timeframe enum と同値

export const ChartMetaQuerySchema = z.object({
  symbol:    z.string().min(1).max(10),
  timeframe: TimeframeSchema,
});

export type ChartMetaQuery = z.infer<typeof ChartMetaQuerySchema>;
```

**レスポンス JSON:**

```typescript
// GET /api/v1/chart/meta → 200
interface ChartMetaResponse {
  symbol:        string;          // 例: "EURUSD"
  timeframe:     Timeframe;       // 例: "H1"
  currentPrice:  number;          // 例: 1.0842
  spread:        number;          // 例: 0.3（pips）
  marketStatus:  'open' | 'closed';
  sessionLabel:  string;          // 例: "London Open" | "Tokyo" | "NY" | "Off"
  trendBias:     'bullish' | 'bearish' | 'neutral';
  cachedAt:      string | null;   // ISO 8601（キャッシュ値の場合に非 null）
  updatedAt:     string;          // ISO 8601
}
```

**エラーケース:**

| HTTP | Error Code | 発生条件 |
|------|-----------|---------|
| 400 | `VALIDATION_ERROR` | symbol / timeframe 不正 |
| 401 | `UNAUTHORIZED` | AT なし / 期限切れ |
| 503 | `CONNECTOR_UNAVAILABLE` | Alpha Vantage 障害時 |

---

### 3.2 GET /api/v1/chart/candles

**役割:** ローソク足 OHLCV データを返す。
PG-07 `main-chart` セクションのデータソース。
v5.1 では placeholder 表示のため、データは `market_candles` テーブルのキャッシュから返す。

**アクセス権限:** 全ロール（`FREE | BASIC | PRO | PRO_PLUS | ADMIN`）

**クエリパラメータ:**

| パラメータ | 型 | 必須 | デフォルト | 説明 | 例 |
|-----------|------|:----:|:--------:|------|-----|
| `symbol` | string | ✅ | — | 通貨ペア | `EURUSD` |
| `timeframe` | Timeframe | ✅ | — | 時間足 | `H4` |
| `limit` | number | — | `100` | 取得本数（最大 500）| `200` |
| `before` | string | — | 現在時刻 | ISO 8601 終端時刻（この時刻以前を取得）| `2025-03-01T00:00:00Z` |

**Zod Schema（正本）:**

```typescript
// packages/types/src/schemas/chart.schema.ts

export const ChartCandlesQuerySchema = z.object({
  symbol:    z.string().min(1).max(10),
  timeframe: TimeframeSchema,
  limit:     z.coerce.number().int().min(1).max(500).default(100),
  before:    z.string().datetime().optional(),
});

export type ChartCandlesQuery = z.infer<typeof ChartCandlesQuerySchema>;
```

**レスポンス JSON:**

```typescript
// GET /api/v1/chart/candles → 200
interface ChartCandlesResponse {
  symbol:    string;
  timeframe: Timeframe;
  candles:   Candle[];
  cachedAt:  string | null;   // ISO 8601（キャッシュ値の場合に非 null）
}

interface Candle {
  time:   string;   // ISO 8601 UTC
  open:   number;
  high:   number;
  low:    number;
  close:  number;
  volume: number;
}
```

**エラーケース:**

| HTTP | Error Code | 発生条件 |
|------|-----------|---------|
| 400 | `VALIDATION_ERROR` | パラメータ不正 |
| 401 | `UNAUTHORIZED` | AT なし / 期限切れ |
| 503 | `CONNECTOR_UNAVAILABLE` | Alpha Vantage 障害時 |

---

### 3.3 GET /api/v1/chart/indicators

**役割:** MA / RSI / MACD / ATR / BB / Bias の計算結果を返す。
PG-07 `indicator-summary` セクション（6 カード）のデータソース。
計算結果は `indicator_cache` テーブルにキャッシュする。

**アクセス権限:** 全ロール（`FREE | BASIC | PRO | PRO_PLUS | ADMIN`）

**クエリパラメータ:**

| パラメータ | 型 | 必須 | 説明 | 例 |
|-----------|------|:----:|------|-----|
| `symbol` | string | ✅ | 通貨ペア | `EURUSD` |
| `timeframe` | Timeframe | ✅ | 時間足 | `H1` |

**Zod Schema（正本）:**

```typescript
// packages/types/src/schemas/chart.schema.ts

export const ChartIndicatorsQuerySchema = z.object({
  symbol:    z.string().min(1).max(10),
  timeframe: TimeframeSchema,
});

export type ChartIndicatorsQuery = z.infer<typeof ChartIndicatorsQuerySchema>;
```

**レスポンス JSON:**

```typescript
// GET /api/v1/chart/indicators → 200
interface ChartIndicatorsResponse {
  symbol:     string;
  timeframe:  Timeframe;
  indicators: IndicatorSet;
  cachedAt:   string | null;   // ISO 8601（キャッシュ値の場合に非 null）
  updatedAt:  string;          // ISO 8601
}

interface IndicatorSet {
  ma:   MaResult;
  rsi:  RsiResult;
  macd: MacdResult;
  atr:  AtrResult;
  bb:   BbResult;
  bias: BiasResult;
}

interface MaResult {
  value:       number;          // MA50 現在値
  crossStatus: 'bullish' | 'bearish' | 'neutral';
  slope:       number;          // 正 = 上昇傾向
  status:      'bullish' | 'bearish' | 'neutral';
}

interface RsiResult {
  value:      number;           // 0〜100
  divergence: boolean;
  status:     'bullish' | 'bearish' | 'neutral';
}

interface MacdResult {
  macd:        number;
  signal:      number;
  histogram:   number;
  crossStatus: 'bullish' | 'bearish' | 'neutral';
  status:      'bullish' | 'bearish' | 'neutral';
}

interface AtrResult {
  value:  number;               // ATR 現在値（pips）
  ratio:  number;               // ATR / 平均 ATR（1.0 = 平均）
  status: 'normal' | 'high' | 'low';
}

interface BbResult {
  upper:    number;
  middle:   number;
  lower:    number;
  position: 'upper' | 'upper-middle' | 'middle' | 'lower-middle' | 'lower';
  status:   'bullish' | 'bearish' | 'neutral';
}

interface BiasResult {
  direction: 'buy' | 'sell' | 'neutral';
  strength:  'strong' | 'moderate' | 'weak' | 'none';
  label:     string;            // 例: "Bias: buy moderate"
  status:    'bullish' | 'bearish' | 'neutral';
}
```

**PG-07 `indicator-summary` カードとの対応:**

| カード ID | レスポンスフィールド | 表示例 |
|----------|-------------------|--------|
| `ma` | `indicators.ma` | `MA: bullish cross` |
| `rsi` | `indicators.rsi` | `RSI: 58.3 neutral` |
| `macd` | `indicators.macd` | `MACD: above signal` |
| `atr` | `indicators.atr` | `ATR: normal` |
| `bb` | `indicators.bb` | `BB: upper-middle` |
| `bias` | `indicators.bias` | `Bias: buy moderate` |

**エラーケース:**

| HTTP | Error Code | 発生条件 |
|------|-----------|---------|
| 400 | `VALIDATION_ERROR` | パラメータ不正 |
| 401 | `UNAUTHORIZED` | AT なし / 期限切れ |
| 503 | `CONNECTOR_UNAVAILABLE` | Alpha Vantage 障害時 |

---

### 3.4 GET /api/v1/chart/trades

**役割:** 指定ペアのアクティブトレード（`status=OPEN`）情報を返す。
PG-07 `trade-overlay-panel` セクションのデータソース。
このエンドポイントは `trades` テーブル（コアテーブル）を参照する。Chart 専用 DB は使用しない。

**アクセス権限:** 全ロール（`FREE | BASIC | PRO | PRO_PLUS | ADMIN`）

**クエリパラメータ:**

| パラメータ | 型 | 必須 | 説明 | 例 |
|-----------|------|:----:|------|-----|
| `symbol` | string | ✅ | 通貨ペア | `EURUSD` |

**Zod Schema（正本）:**

```typescript
// packages/types/src/schemas/chart.schema.ts

export const ChartTradesQuerySchema = z.object({
  symbol: z.string().min(1).max(10),
});

export type ChartTradesQuery = z.infer<typeof ChartTradesQuerySchema>;
```

**レスポンス JSON:**

```typescript
// GET /api/v1/chart/trades → 200
interface ChartTradesResponse {
  symbol:      string;
  activeTrade: ActiveTradeInfo | null;  // null = アクティブトレードなし
}

interface ActiveTradeInfo {
  tradeId:        string;
  side:           'BUY' | 'SELL';
  entryPrice:     number;
  stopLoss:       number | null;
  takeProfit:     number | null;
  rrRatio:        number | null;        // (takeProfit - entryPrice) / (entryPrice - stopLoss)
  lotSize:        number;
  expectedLoss:   number | null;        // 円換算
  expectedGain:   number | null;        // 円換算
  entryTime:      string;               // ISO 8601
}
```

> アクティブトレードが存在しない場合は `activeTrade: null` を返す。
> フロントは `activeTrade === null` のとき "No Active Trade" プレースホルダーを表示する（Part 10 §10.9 準拠）。

**エラーケース:**

| HTTP | Error Code | 発生条件 |
|------|-----------|---------|
| 400 | `VALIDATION_ERROR` | symbol 不正 |
| 401 | `UNAUTHORIZED` | AT なし / 期限切れ |

---

### 3.5 GET /api/v1/chart/pattern-markers

**役割:** チャート上に表示するパターン検出マーカーを返す。
PG-07 `main-chart` のパターンラベル overlay のデータソース。
検出結果は `pattern_detections` テーブルにログとして保存される。

**アクセス権限:** 全ロール（`FREE | BASIC | PRO | PRO_PLUS | ADMIN`）
ただし **ロール別パターン種別フィルタあり**（Part 1 §0-16 準拠）:

| ロール | 返却パターン種別 |
|--------|---------------|
| `FREE` | ローソク足 6 種のみ |
| `BASIC \| PRO \| PRO_PLUS \| ADMIN` | 全 12 種 |

> フィルタはバックエンドで完結する。フロント側でのフィルタリング禁止（Part 1 §0-16）。

**クエリパラメータ:**

| パラメータ | 型 | 必須 | デフォルト | 説明 | 例 |
|-----------|------|:----:|:--------:|------|-----|
| `symbol` | string | ✅ | — | 通貨ペア | `EURUSD` |
| `timeframe` | Timeframe | ✅ | — | 時間足 | `H4` |
| `limit` | number | — | `20` | 返却件数（最大 50）| `30` |

**Zod Schema（正本）:**

```typescript
// packages/types/src/schemas/chart.schema.ts

export const ChartPatternMarkersQuerySchema = z.object({
  symbol:    z.string().min(1).max(10),
  timeframe: TimeframeSchema,
  limit:     z.coerce.number().int().min(1).max(50).default(20),
});

export type ChartPatternMarkersQuery = z.infer<typeof ChartPatternMarkersQuerySchema>;
```

**レスポンス JSON:**

```typescript
// GET /api/v1/chart/pattern-markers → 200
interface ChartPatternMarkersResponse {
  symbol:    string;
  timeframe: Timeframe;
  markers:   PatternMarker[];
}

// patternName は Part 6 §1.0 の正式名称を使用する（下表参照）
// patternCategory は Part 6 §1.1 の分類体系に準拠する
interface PatternMarker {
  id:              string;    // pattern_detections.id
  patternName:     PatternName;   // Part 6 §1.0 正式名称（下表参照）
  patternCategory: 'CANDLESTICK' | 'FORMATION';  // Part 6 §1.1 分類体系
  direction:       'bullish' | 'bearish' | 'neutral';
  confidence:      number;    // 0.0〜1.0（Part 6 §1.4 calcPatternConfidence 準拠）
  detectedAt:      string;    // ISO 8601（検出時刻）
  barIndex:        number;    // チャート上のバーインデックス（ローソク足位置）
  price:           number;    // パターン検出価格
  label:           string;    // チャート表示ラベル（例: "PinBar" / "H&S"）
}

// Part 6 §1.0 準拠の正式パターン名 Union 型
// CANDLESTICK（ローソク足 6 種）: Part 6 §1.3 定義
// FORMATION（フォーメーション 6 種）: Part 6 §1.2 定義
type PatternName =
  // CANDLESTICK（ローソク足 6 種）— FREE 以上
  | 'PinBar'
  | 'Engulfing'
  | 'MorningStar'
  | 'ShootingStar'
  | 'Doji'
  | 'ThreeSoldiers'
  // FORMATION（フォーメーション 6 種）— BASIC | PRO | PRO_PLUS | ADMIN のみ
  | 'DoubleBottom'
  | 'DoubleTop'
  | 'HeadAndShoulders'
  | 'Triangle'
  | 'Flag'
  | 'CupAndHandle';
```

**パターン体系と RBAC の対応（Part 6 §1.0 正本）:**

> **重要**: パターン名称・分類は Part 6 §1.0 を唯一の正本とする。
> 本表以外の名称（`Hammer` / `Bullish Engulfing` / `Inverse Head and Shoulders` /
> `Ascending Triangle` / `Descending Triangle` 等）は使用しない。

| 分類 | Part 6 正式パターン名 | `patternCategory` | FREE | `BASIC \| PRO \| PRO_PLUS \| ADMIN` |
|------|---------------------|:-----------------:|:----:|:-----------------------------------:|
| ローソク足 | `PinBar` | `CANDLESTICK` | ✅ | ✅ |
| ローソク足 | `Engulfing` | `CANDLESTICK` | ✅ | ✅ |
| ローソク足 | `MorningStar` | `CANDLESTICK` | ✅ | ✅ |
| ローソク足 | `ShootingStar` | `CANDLESTICK` | ✅ | ✅ |
| ローソク足 | `Doji` | `CANDLESTICK` | ✅ | ✅ |
| ローソク足 | `ThreeSoldiers` | `CANDLESTICK` | ✅ | ✅ |
| フォーメーション | `DoubleBottom` | `FORMATION` | ❌ | ✅ |
| フォーメーション | `DoubleTop` | `FORMATION` | ❌ | ✅ |
| フォーメーション | `HeadAndShoulders` | `FORMATION` | ❌ | ✅ |
| フォーメーション | `Triangle` | `FORMATION` | ❌ | ✅ |
| フォーメーション | `Flag` | `FORMATION` | ❌ | ✅ |
| フォーメーション | `CupAndHandle` | `FORMATION` | ❌ | ✅ |

**エラーケース:**

| HTTP | Error Code | 発生条件 |
|------|-----------|---------|
| 400 | `VALIDATION_ERROR` | パラメータ不正 |
| 401 | `UNAUTHORIZED` | AT なし / 期限切れ |

---

### 3.6 GET /api/v1/chart/prediction-overlay

**役割:** PG-07 `prediction-overlay-panel` のデータを返す。
v5.1 では `STUB_PREDICTION_RESULT`（Part 8 §9.3 準拠）の固定値のみを返す。
DTW / HMM / 実計算は v6 で実装する。

**アクセス権限:** `PRO | PRO_PLUS | ADMIN` のみ
`FREE | BASIC` に対しては `RolesGuard` が HTTP 403 を返す（二重保護。Part 10 §1.2 準拠）。

> **フロント UI 連携（Part 10 §10.10 準拠）:**
> `FREE | BASIC` が本エンドポイントを呼び出した場合、バックエンドは HTTP 403 を返す。
> フロントは 403 受信時に `prediction-overlay-panel` セクションをロック状態 UI へ切り替える。
> ロック状態 UI の詳細仕様は Part 10 §10.10 を参照すること（本 Part で UI を定義しない）。
> セクション自体を非表示にしてはならない。ロック状態 UI として必ず描画する。

**クエリパラメータ:**

| パラメータ | 型 | 必須 | 説明 | 例 |
|-----------|------|:----:|------|-----|
| `symbol` | string | ✅ | 通貨ペア | `EURUSD` |
| `timeframe` | Timeframe | ✅ | 時間足 | `H1` |

**Zod Schema（正本）:**

```typescript
// packages/types/src/schemas/chart.schema.ts

export const ChartPredictionOverlayQuerySchema = z.object({
  symbol:    z.string().min(1).max(10),
  timeframe: TimeframeSchema,
});

export type ChartPredictionOverlayQuery = z.infer<typeof ChartPredictionOverlayQuerySchema>;
```

**レスポンス JSON:**

```typescript
// GET /api/v1/chart/prediction-overlay → 200
// v5.1: 常に STUB_PREDICTION_RESULT ベースの固定値を返す
interface ChartPredictionOverlayResponse {
  symbol:            string;
  timeframe:         Timeframe;
  mainScenario:      string;            // 例: "Bullish Continuation"
  altScenario:       string;            // 例: "Range Consolidation"
  probabilities: {
    bullish:         number;            // STUB: 0.63
    neutral:         number;            // STUB: 0.22
    bearish:         number;            // STUB: 0.15
  };
  expectedMovePips:  number;            // STUB 固定値
  forecastHorizonH:  number;            // STUB 固定値（時間）
  confidence:        'high' | 'medium' | 'low';  // STUB: "medium"
  stub:              true;              // v5.1 スタブ結果であることを明示するフラグ
  generatedAt:       string;            // ISO 8601
}
```

**STUB 変換ルール（Part 8 §9.3 → Chart API レスポンス）:**

> **方針**: `GET /api/v1/chart/prediction-overlay` は Part 8 §9.3 の `STUB_PREDICTION_RESULT` を
> Chart 表示用に変換して返す。DB に保存された `prediction_results.result_data` をそのまま返すのではなく、
> `ChartService` の変換ロジックを介して `ChartPredictionOverlayResponse` 型に整形する。

| Part 8 STUB_PREDICTION_RESULT フィールド | 変換ロジック | Chart API レスポンスフィールド |
|-----------------------------------------|-------------|-------------------------------|
| `scenarios.bull.probability: 0.63` | そのまま | `probabilities.bullish: 0.63` |
| `scenarios.neutral.probability: 0.22` | そのまま | `probabilities.neutral: 0.22` |
| `scenarios.bear.probability: 0.15` | そのまま | `probabilities.bearish: 0.15` |
| `scenarios.bull.target: '+0.8%'` | 文字列パース → pips 換算（固定: 45）| `expectedMovePips: 45` |
| `scenarios.bull.horizonBars: 12` | H4想定（12本×4h）= 48h → 表示用 24h に丸め（stub は時間足不問の固定値のため、PG-07 UI で "24h" という短い区切りで表示する方がユーザーに分かりやすいという表示設計上の判断。v6 では `timeframe` 実値から動的計算する）| `forecastHorizonH: 24` |
| `stats.confidence: 0.55` | 0.5〜0.65 → `"medium"` に変換 | `confidence: 'medium'` |
| `stats.note: 'v5.1 STUB result'` | stub フラグに変換 | `stub: true` |
| `tfWeights: null` | Chart API には含めない（v6 対象）| — |
| `hmmState: null` | Chart API には含めない（v6 対象）| — |

> **confidence 変換ルール（v5.1 固定）**:
> `stats.confidence < 0.50` → `'low'` /
> `stats.confidence 0.50〜0.74` → `'medium'` /
> `stats.confidence >= 0.75` → `'high'`
> v5.1 スタブでは `stats.confidence = 0.55` → 常に `'medium'` を返す。

```typescript
// apps/api/src/chart/chart.service.ts
// v5.1: STUB_PREDICTION_RESULT → ChartPredictionOverlayResponse への変換関数

import { STUB_PREDICTION_RESULT } from '../jobs/prediction-dispatch.processor';

function mapStubToOverlay(
  symbol: string,
  timeframe: Timeframe,
): ChartPredictionOverlayResponse {
  const stub = STUB_PREDICTION_RESULT;

  // confidence 数値 → 文字列ラベル変換
  const confidenceLabel: 'high' | 'medium' | 'low' =
    stub.stats.confidence >= 0.75 ? 'high'
    : stub.stats.confidence >= 0.50 ? 'medium'
    : 'low';

  return {
    symbol,
    timeframe,
    mainScenario:     'Bullish Continuation',     // STUB 固定
    altScenario:      'Range Consolidation',       // STUB 固定
    probabilities: {
      bullish:        stub.scenarios.bull.probability,     // 0.63
      neutral:        stub.scenarios.neutral.probability,  // 0.22
      bearish:        stub.scenarios.bear.probability,     // 0.15
    },
    expectedMovePips: 45,    // STUB 固定（bull.target '+0.8%' の pips 近似値）
    forecastHorizonH: 24,    // STUB 固定（horizonBars:12 × H4=4h → 表示用 24h）
    confidence:       confidenceLabel,             // 'medium'（stats.confidence=0.55）
    stub:             true,
    generatedAt:      new Date().toISOString(),
  };
}
```

**STUB 固定値（Part 8 §9.3 STUB_PREDICTION_RESULT 準拠）:**

```typescript
// apps/api/src/chart/chart.service.ts
// v5.1: prediction-overlay は常にこの固定値を返す

const CHART_PREDICTION_OVERLAY_STUB: ChartPredictionOverlayResponse = {
  symbol:           '{{symbol}}',       // クエリパラメータで置換
  timeframe:        '{{timeframe}}',    // クエリパラメータで置換
  mainScenario:     'Bullish Continuation',
  altScenario:      'Range Consolidation',
  probabilities: {
    bullish:        0.63,
    neutral:        0.22,
    bearish:        0.15,
  },
  expectedMovePips: 45,
  forecastHorizonH: 24,
  confidence:       'medium',
  stub:             true,
  generatedAt:      new Date().toISOString(),
};
```

**`FREE | BASIC` へのエラーレスポンス（Part 3 §15 統一形式）:**

```json
{
  "statusCode": 403,
  "error": "FORBIDDEN",
  "message": "この機能は PRO | PRO_PLUS | ADMIN のみ利用できます",
  "timestamp": "2025-03-01T10:00:00.000Z",
  "path": "/api/v1/chart/prediction-overlay"
}
```

**エラーケース:**

| HTTP | Error Code | 発生条件 |
|------|-----------|---------|
| 400 | `VALIDATION_ERROR` | パラメータ不正 |
| 401 | `UNAUTHORIZED` | AT なし / 期限切れ |
| 403 | `FORBIDDEN` | `FREE \| BASIC` ロールによるアクセス |

---

## 4. キャッシュ戦略

### 4.1 Chart API キャッシュ設計

| エンドポイント | キャッシュ手段 | TTL | キャッシュキー |
|-------------|-------------|-----|-------------|
| `GET /api/v1/chart/meta` | Redis | H4以上: 15分 / H1以下: 5分 | `chart:meta:{symbol}:{timeframe}` |
| `GET /api/v1/chart/candles` | Redis + `market_candles` テーブル | H4以上: 15分 / H1以下: 5分 | `chart:candles:{symbol}:{timeframe}:{limit}:{before}` |
| `GET /api/v1/chart/indicators` | Redis + `indicator_cache` テーブル | H4以上: 15分 / H1以下: 5分 | `chart:indicators:{symbol}:{timeframe}` |
| `GET /api/v1/chart/trades` | なし（都度 DB クエリ）| — | — |
| `GET /api/v1/chart/pattern-markers` | Redis + `pattern_detections` テーブル | 5分 | `chart:patterns:{symbol}:{timeframe}:{userId_role}` |
| `GET /api/v1/chart/prediction-overlay` | なし（固定値を都度生成）| — | — |

> TTL の根拠: Part 1 §8.4 キャッシュ TTL 定義準拠。
> H4以上 = 15分 / H1以下 = 5分（AlphaVantage 500 req/日 制限への対応）。

### 4.2 TTL 詳細

| 時間足 | TTL |
|--------|-----|
| `M1 | M5 | M15 | M30 | H1` | **5分** |
| `H4 | H8 | D1 | W1 | MN` | **15分** |

### 4.3 キャッシュヒット時のレスポンス

キャッシュ値を返す場合は `cachedAt` フィールドに ISO 8601 文字列を設定する。
キャッシュなし（最新データ）の場合は `cachedAt: null` を返す。
フロントは `cachedAt !== null` のとき UI に「キャッシュ値」バッジを表示する（Part 1 §8.3 準拠）。

### 4.4 フォールバック戦略

| 状況 | 対応 |
|------|------|
| Alpha Vantage タイムアウト | Redis キャッシュを返す。`cachedAt` を非 null にセット |
| Redis キャッシュも存在しない | `market_candles` テーブルから最終保存値を返す |
| DB にもデータなし | HTTP 503 `CONNECTOR_UNAVAILABLE` を返す |
| pattern_detections に未検出 | `markers: []` を返す（503 にしない）|

---

## 5. Chart DB テーブル

### 5.1 テーブル一覧

| テーブル名 | 役割 | コアテーブルとの関係 |
|-----------|------|-------------------|
| `market_candles` | ローソク足 OHLCV キャッシュ | 独立（ユーザー非依存）|
| `indicator_cache` | インジケーター計算結果キャッシュ | 独立（ユーザー非依存）|
| `pattern_detections` | チャートパターン検出ログ | `users` テーブルを参照（ユーザー別）|
| `chart_snapshots` | チャート状態スナップショット | `users` テーブルを参照（ユーザー別）|

> **コアテーブル（Part 2 §6.1）との役割分離を厳守する。**
> `users` / `trades` / `snapshots` 等のコアテーブルは本 Part で再定義しない。
> `chart_snapshots` と `snapshots`（コア）は別テーブルであり役割が異なる。
> `snapshots`（コア）= スコア計算結果のスナップショット。
> `chart_snapshots`（Chart 専用）= PG-07 チャート状態のスナップショット。

### 5.2 market_candles テーブル

**役割:** Alpha Vantage から取得した OHLCV データのキャッシュ。ユーザー非依存の共有テーブル。

| カラム | 型 | 説明 |
|-------|------|------|
| `id` | UUID PK | — |
| `symbol` | VARCHAR(10) | 通貨ペア（例: `EURUSD`）|
| `timeframe` | Timeframe enum | 時間足 |
| `time` | TIMESTAMPTZ | ローソク足の開始時刻（UTC）|
| `open` | DECIMAL(18,6) | 始値 |
| `high` | DECIMAL(18,6) | 高値 |
| `low` | DECIMAL(18,6) | 安値 |
| `close` | DECIMAL(18,6) | 終値 |
| `volume` | BIGINT | 出来高 |
| `source` | VARCHAR(50) | データ提供元（例: `alpha_vantage`）|
| `created_at` | TIMESTAMPTZ | レコード作成日時 |
| `updated_at` | TIMESTAMPTZ | レコード更新日時 |

**制約・インデックス:**

- `UNIQUE(symbol, timeframe, time)` — 同一ペア・時間足・時刻の重複防止
- `INDEX(symbol, timeframe, time DESC)` — 時系列取得（最新 N 本取得）

### 5.3 indicator_cache テーブル

**役割:** インジケーター（MA / RSI / MACD / ATR / BB / Bias）の計算結果キャッシュ。ユーザー非依存の共有テーブル。

| カラム | 型 | 説明 |
|-------|------|------|
| `id` | UUID PK | — |
| `symbol` | VARCHAR(10) | 通貨ペア |
| `timeframe` | Timeframe enum | 時間足 |
| `calculated_at` | TIMESTAMPTZ | 計算実行時刻（UTC）|
| `indicators` | JSONB | 計算結果（`IndicatorSet` 型 §3.3 準拠）|
| `source` | VARCHAR(50) | データ提供元（例: `alpha_vantage`）|
| `created_at` | TIMESTAMPTZ | レコード作成日時 |
| `updated_at` | TIMESTAMPTZ | レコード更新日時 |

**制約・インデックス:**

- `INDEX(symbol, timeframe, calculated_at DESC)` — 最新キャッシュ取得
- `INDEX(calculated_at)` — TTL 期限切れレコードのクリーンアップ用

### 5.4 pattern_detections テーブル

**役割:** チャートパターン検出結果のログ。PG-07 `main-chart` のパターンマーカー表示に使用。ユーザー別に記録する。

| カラム | 型 | 説明 |
|-------|------|------|
| `id` | UUID PK | — |
| `user_id` | UUID FK | `users.id` を参照（Cascade Delete）|
| `symbol` | VARCHAR(10) | 通貨ペア |
| `timeframe` | Timeframe enum | 時間足 |
| `pattern_name` | VARCHAR(100) | パターン名（Part 6 §1.0 正式名称。例: `PinBar` / `HeadAndShoulders`）|
| `pattern_category` | VARCHAR(20) | Part 6 §1.1 分類: `CANDLESTICK`（ローソク足 6 種）または `FORMATION`（フォーメーション 6 種）|
| `direction` | VARCHAR(10) | `bullish` / `bearish` / `neutral` |
| `confidence` | DECIMAL(5,4) | 信頼度 0.0000〜1.0000 |
| `detected_at` | TIMESTAMPTZ | パターン検出時刻（UTC）|
| `bar_index` | INTEGER | チャート上のバーインデックス |
| `price` | DECIMAL(18,6) | 検出価格 |
| `label` | VARCHAR(50) | チャート表示ラベル |
| `created_at` | TIMESTAMPTZ | レコード作成日時 |
| `updated_at` | TIMESTAMPTZ | レコード更新日時 |

**制約・インデックス:**

- `INDEX(user_id, symbol, timeframe, detected_at DESC)` — ユーザー別パターン一覧取得
- `INDEX(user_id, detected_at DESC)` — 全ペアの最新パターン取得

### 5.5 chart_snapshots テーブル

**役割:** PG-07 チャートの状態スナップショット（表示設定・メモ等）を保存する。
v5.1 では chart-notes の永続化は実装しない（React state のみ）。
v6 でトレード記録 CRUD との接続時に本テーブルを使用する（Part 10 §10.11 準拠）。

| カラム | 型 | 説明 |
|-------|------|------|
| `id` | UUID PK | — |
| `user_id` | UUID FK | `users.id` を参照（Cascade Delete）|
| `symbol` | VARCHAR(10) | 通貨ペア |
| `timeframe` | Timeframe enum | 時間足 |
| `captured_at` | TIMESTAMPTZ | スナップショット取得時刻（UTC）|
| `chart_config` | JSONB | チャート表示設定（indicator トグル等）|
| `overlay_state` | JSONB | overlay 表示状態（Entry/SL/TP/Prediction on/off）|
| `notes` | TEXT | chart-notes の入力内容（v6 で永続化）|
| `trade_id` | UUID | 関連トレード ID（nullable / v6 で接続）|
| `created_at` | TIMESTAMPTZ | レコード作成日時 |
| `updated_at` | TIMESTAMPTZ | レコード更新日時 |

**制約・インデックス:**

- `INDEX(user_id, symbol, captured_at DESC)` — ユーザー別最新スナップショット取得
- `INDEX(user_id, captured_at DESC)` — ユーザーの全スナップショット履歴

---

## 6. Prisma Schema

```prisma
// apps/api/prisma/schema.prisma への追記分
// Chart 専用テーブル 4 種（Part 11 正本）
// ※ 既存の model User / Trade / Snapshot 等のコアモデルはここに記載しない
// ※ Timeframe enum は Part 2 定義済みのものをそのまま使用する

// ══════════════════════════════════════════
// Chart 専用テーブル（PG-07 用）
// ══════════════════════════════════════════

/// ローソク足 OHLCV キャッシュ（ユーザー非依存・共有テーブル）
model MarketCandle {
  id        String    @id @default(uuid())
  symbol    String    @db.VarChar(10)
  timeframe Timeframe
  time      DateTime  @db.Timestamptz(6)
  open      Decimal   @db.Decimal(18, 6)
  high      Decimal   @db.Decimal(18, 6)
  low       Decimal   @db.Decimal(18, 6)
  close     Decimal   @db.Decimal(18, 6)
  volume    BigInt
  source    String    @db.VarChar(50)  // 例: "alpha_vantage"
  createdAt DateTime  @default(now()) @map("created_at")
  updatedAt DateTime  @updatedAt      @map("updated_at")

  @@unique([symbol, timeframe, time])
  @@index([symbol, timeframe, time(sort: Desc)])
  @@map("market_candles")
}

/// インジケーター計算結果キャッシュ（ユーザー非依存・共有テーブル）
model IndicatorCache {
  id           String    @id @default(uuid())
  symbol       String    @db.VarChar(10)
  timeframe    Timeframe
  calculatedAt DateTime  @map("calculated_at") @db.Timestamptz(6)

  // indicators JSONB 構造: IndicatorSet 型（§3.3 ChartIndicatorsResponse.indicators 準拠）
  // {
  //   ma:   { value, crossStatus, slope, status },
  //   rsi:  { value, divergence, status },
  //   macd: { macd, signal, histogram, crossStatus, status },
  //   atr:  { value, ratio, status },
  //   bb:   { upper, middle, lower, position, status },
  //   bias: { direction, strength, label, status },
  // }
  indicators   Json

  source       String    @db.VarChar(50)  // 例: "alpha_vantage"
  createdAt    DateTime  @default(now()) @map("created_at")
  updatedAt    DateTime  @updatedAt      @map("updated_at")

  @@index([symbol, timeframe, calculatedAt(sort: Desc)])
  @@index([calculatedAt])
  @@map("indicator_cache")
}

/// チャートパターン検出ログ（ユーザー別）
model PatternDetection {
  id          String    @id @default(uuid())
  userId      String    @map("user_id")
  symbol      String    @db.VarChar(10)
  timeframe   Timeframe
  // patternName: Part 6 §1.0 の正式名称のみ使用する
  // CANDLESTICK: PinBar / Engulfing / MorningStar / ShootingStar / Doji / ThreeSoldiers
  // FORMATION:   DoubleBottom / DoubleTop / HeadAndShoulders / Triangle / Flag / CupAndHandle
  patternName     String    @map("pattern_name")     @db.VarChar(100)
  // patternCategory: Part 6 §1.1 分類体系に準拠
  // "CANDLESTICK"（ローソク足 6 種）または "FORMATION"（フォーメーション 6 種）
  patternCategory String    @map("pattern_category") @db.VarChar(20)
  direction   String    @db.VarChar(10)   // "bullish" | "bearish" | "neutral"
  confidence  Decimal   @db.Decimal(5, 4) // 0.0000〜1.0000
  detectedAt  DateTime  @map("detected_at") @db.Timestamptz(6)
  barIndex    Int       @map("bar_index")
  price       Decimal   @db.Decimal(18, 6)
  label       String    @db.VarChar(50)
  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @updatedAt      @map("updated_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, symbol, timeframe, detectedAt(sort: Desc)])
  @@index([userId, detectedAt(sort: Desc)])
  @@map("pattern_detections")
}

/// チャート状態スナップショット（ユーザー別）
/// v5.1: テーブル定義のみ。chart-notes 永続化は v6 で実装。
model ChartSnapshot {
  id           String    @id @default(uuid())
  userId       String    @map("user_id")
  symbol       String    @db.VarChar(10)
  timeframe    Timeframe
  capturedAt   DateTime  @map("captured_at") @db.Timestamptz(6)

  // chartConfig JSONB 構造（v5.1 では保存のみ・読み出しは v6）:
  // {
  //   indicators: { ma: boolean, rsi: boolean, macd: boolean, bb: boolean, atr: boolean, fib: boolean, trendline: boolean },
  //   overlays:   { entry_sl_tp: boolean, prediction: boolean, trade_markers: boolean, pattern_labels: boolean },
  //   chartType:  "candles" | "line" | "area",
  // }
  chartConfig  Json      @map("chart_config")

  // overlayState JSONB 構造:
  // {
  //   entryPrice: number | null,
  //   stopLoss:   number | null,
  //   takeProfit: number | null,
  // }
  overlayState Json      @map("overlay_state")

  // chart-notes の入力内容（v5.1 = null 固定 / v6 で永続化）
  notes        String?

  // 関連トレード ID（v5.1 = null 固定 / v6 でトレード記録 CRUD と接続）
  tradeId      String?   @map("trade_id")

  createdAt    DateTime  @default(now()) @map("created_at")
  updatedAt    DateTime  @updatedAt      @map("updated_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, symbol, capturedAt(sort: Desc)])
  @@index([userId, capturedAt(sort: Desc)])
  @@map("chart_snapshots")
}
```

**User モデルへのリレーション追記（Part 2 §2 既存モデルへの追記）:**

```prisma
// apps/api/prisma/schema.prisma
// 既存の model User { ... } に以下のリレーションフィールドを追記する

model User {
  // ... 既存フィールド（Part 2 §2 参照）...

  // Chart 専用テーブルとのリレーション（Part 11 追記）
  patternDetections PatternDetection[]
  chartSnapshots    ChartSnapshot[]

  // @@map("users") は既存のまま
}
```

---

## 7. インデックス設計

### 7.1 Chart 専用テーブルのインデックス一覧

| テーブル | インデックス | 用途 |
|---------|------------|------|
| `market_candles` | `UNIQUE(symbol, timeframe, time)` | 重複防止 / upsert キー |
| `market_candles` | `(symbol, timeframe, time DESC)` | 時系列取得（最新 N 本）|
| `indicator_cache` | `(symbol, timeframe, calculated_at DESC)` | 最新インジケーター取得 |
| `indicator_cache` | `(calculated_at)` | TTL 期限切れクリーンアップ |
| `pattern_detections` | `(user_id, symbol, timeframe, detected_at DESC)` | ユーザー別パターン一覧取得 |
| `pattern_detections` | `(user_id, detected_at DESC)` | ユーザーの全パターン履歴 |
| `chart_snapshots` | `(user_id, symbol, captured_at DESC)` | ユーザー別最新スナップショット |
| `chart_snapshots` | `(user_id, captured_at DESC)` | ユーザーの全スナップショット履歴 |

### 7.2 インデックス設計の根拠

| 設計判断 | 理由 |
|---------|------|
| `market_candles` に UNIQUE(symbol, timeframe, time) | Alpha Vantage から同一データを複数回取得した場合の重複防止。upsert の ON CONFLICT キーとして使用 |
| `indicator_cache` に `(calculated_at)` 単独インデックス | TTL が切れた古いキャッシュレコードを定期クリーンアップするジョブが `calculated_at < NOW() - interval` でフルスキャンしないようにする |
| `pattern_detections` にユーザー別複合インデックス | `WHERE user_id = ? AND symbol = ? AND timeframe = ? ORDER BY detected_at DESC LIMIT 20` のクエリパターンに最適化 |
| `chart_snapshots` の `trade_id` にインデックス不要（v5.1）| v5.1 では `trade_id` は常に null。v6 でトレード接続時に `@@index([tradeId])` を追加する |

---

## 8. PG-07 Chart との対応

### 8.1 セクション別データソース対応表

| PG-07 セクション（Part 10 §10.4）| データソース | API |
|---------------------------------|------------|-----|
| `chart-overview` | Alpha Vantage（Redis キャッシュ経由）| `GET /api/v1/chart/meta` |
| `chart-toolbar` | フロント状態管理（Zustand）| API 不要（UI 状態のみ）|
| `main-chart` | `market_candles` テーブル + Redis | `GET /api/v1/chart/candles` |
| `indicator-summary`（6 カード）| `indicator_cache` テーブル + Redis | `GET /api/v1/chart/indicators` |
| `trade-overlay-panel` | `trades` テーブル（コア）| `GET /api/v1/chart/trades` |
| `prediction-overlay-panel` | スタブ固定値（v5.1）| `GET /api/v1/chart/prediction-overlay` |
| `chart-notes` | React state のみ（v5.1 永続化なし）| API なし（v5.1）|
| `recent-signals` | `signals` テーブル（コア）| `GET /api/v1/signals?symbol={pair}&limit=10`（Part 3 §8）|

> `chart-toolbar` はフロントの表示設定 UI であり、バックエンド API は呼び出さない。
> トグル状態は Zustand に保持し、`chart-toolbar` の設定変更時に `main-chart` 等の表示を更新する。

### 8.2 補助 API（Chart 専用 API 以外）

以下の既存 `/api/v1/` エンドポイントは PG-07 の補助的な参照に使用する。
これらは Part 3 の定義が正本であり、本 Part では再定義しない。

| 目的 | エンドポイント | 参照先 |
|------|-------------|--------|
| 直近シグナル一覧 | `GET /api/v1/signals?symbol={pair}&limit=10` | Part 3 §8 |
| 予測 stub（prediction-overlay-panel の補助）| `GET /api/v1/predictions/latest?symbol={pair}` | Part 3 §10 / `PRO \| PRO_PLUS \| ADMIN` のみ |

### 8.3 フロント実装のデータフロー

```
apps/web/src/pages/Chart.tsx
  ├── useChartMeta(symbol, timeframe)
  │     → GET /api/v1/chart/meta
  │     → chart-overview セクションに渡す
  │
  ├── useChartCandles(symbol, timeframe, limit)
  │     → GET /api/v1/chart/candles
  │     → main-chart セクションに渡す
  │
  ├── useChartIndicators(symbol, timeframe)
  │     → GET /api/v1/chart/indicators
  │     → indicator-summary セクションに渡す
  │
  ├── useChartTrades(symbol)
  │     → GET /api/v1/chart/trades
  │     → trade-overlay-panel セクションに渡す
  │
  ├── useChartPatternMarkers(symbol, timeframe)
  │     → GET /api/v1/chart/pattern-markers
  │     → main-chart overlay のパターンラベルに渡す
  │
  ├── useChartPredictionOverlay(symbol, timeframe)     ← PRO | PRO_PLUS | ADMIN のみ
  │     → GET /api/v1/chart/prediction-overlay
  │     → prediction-overlay-panel セクションに渡す
  │     → FREE | BASIC は 403 → ロックバッジ + PRO 誘導表示
  │
  └── useSignals({ symbol, limit: 10 })               ← 既存フック流用
        → GET /api/v1/signals?symbol={pair}&limit=10
        → recent-signals セクションに渡す
```

### 8.4 TanStack Query ポーリング設定

| フック | refetchInterval | 根拠 |
|--------|:---------------:|------|
| `useChartMeta` | 30秒 | 価格・セッション状態の準リアルタイム更新 |
| `useChartCandles` | H1以下: 5分 / H4以上: 15分 | TTL と一致させる |
| `useChartIndicators` | H1以下: 5分 / H4以上: 15分 | TTL と一致させる |
| `useChartTrades` | 10秒 | アクティブトレードの変更を迅速に反映 |
| `useChartPatternMarkers` | 5分 | パターン検出は高頻度不要 |
| `useChartPredictionOverlay` | なし（手動 refetch のみ）| stub 固定値のため自動更新不要 |

---

## 9. v5.1 / v6 機能境界

### 9.1 v5.1 で実装するもの（許可）

```
✅ GET /api/v1/chart/meta          （全ロール / Redis キャッシュ）
✅ GET /api/v1/chart/candles       （全ロール / market_candles + Redis）
✅ GET /api/v1/chart/indicators    （全ロール / indicator_cache + Redis）
✅ GET /api/v1/chart/trades        （全ロール / trades コアテーブル参照）
✅ GET /api/v1/chart/pattern-markers（全ロール / ロール別フィルタ / pattern_detections）
✅ GET /api/v1/chart/prediction-overlay（PRO | PRO_PLUS | ADMIN / STUB 固定値）

✅ market_candles テーブル定義・マイグレーション
✅ indicator_cache テーブル定義・マイグレーション
✅ pattern_detections テーブル定義・マイグレーション
✅ chart_snapshots テーブル定義（v5.1 は notes = null / trade_id = null で保存）

✅ chart-notes の React state 保持（永続化なし・リロードで消える）
✅ prediction-overlay-panel の stub 表示（FREE | BASIC はロックバッジ）
✅ toolbar の indicator / overlay トグル UI（フロント state のみ）
```

### 9.2 v5.1 で実装しないもの（禁止）

```
❌ DTW（動的時間伸縮法）による類似検索
❌ HMM（隠れマルコフモデル）による相場状態分類
❌ prediction-overlay の実計算（実 DTW / HMM 結果）
❌ 予測精度の自動計測・DB 保存（prediction accuracy）
❌ 重み自動学習（auto learning）
❌ chart-notes の DB 永続化（chart_snapshots.notes への保存は v6）
❌ chart_snapshots.trade_id へのトレード接続（v6）
❌ drawing tools の手描き機能（trendline 手描き等）
❌ Lightweight Charts / TradingView Widget の実ローソク足描画（v6）
❌ session zones の実描画（v6）
❌ trade markers（過去履歴）の実描画（v6）
❌ /api/v1/chart/* 以外の Chart 専用 API パス（バージョン接頭辞なしの /api/chart/* 等）
```

### 9.3 v6 対象機能（参考）

> 以下は v6 設計資料であり、v5.1 では実装してはならない。

| 機能 | 概要 |
|------|------|
| prediction-overlay 実計算 | DTW 類似検索・HMM 分類によるシナリオ生成（Part 8 B ブロック参照）|
| chart-notes 永続化 | `chart_snapshots.notes` への保存・読み出し・トレード CRUD 接続 |
| Lightweight Charts 実装 | 実ローソク足描画・MA/BB/Fib overlay のリアル描画 |
| session zones 描画 | 東京・ロンドン・NY セッション帯の背景塗り分け |
| trade markers 過去履歴 | 過去トレードの entry / exit 三角マーカーをチャートに重ねる |
| drawing tools | trendline 手描き・水平線・チャンネル等 |
| pattern_detections 自動更新 | バックグラウンドジョブによる定期パターン検出・DB 保存 |

---

## 10. 実装ガイド

### 10.1 NestJS モジュール実装手順

```
1. apps/api/src/chart/ ディレクトリを作成する
2. ChartModule を AppModule に import する
3. packages/types/src/schemas/chart.schema.ts に全 Zod Schema を定義する
4. apps/api/src/chart/dto/ に createZodDto() 派生 DTO を作成する
5. ChartController に 6 エンドポイントを定義する
6. ChartService に各エンドポイントのビジネスロジックを実装する
7. prisma migrate dev --name add_chart_tables でマイグレーションを実行する
```

### 10.2 RolesGuard 適用方針

```typescript
// apps/api/src/chart/chart.controller.ts

@Controller('chart')
@UseGuards(JwtAuthGuard)               // 全エンドポイントで AT 必須
export class ChartController {

  @Get('meta')                          // 全ロール
  getMeta(@Query() query: ChartMetaQueryDto) { ... }

  @Get('candles')                       // 全ロール
  getCandles(@Query() query: ChartCandlesQueryDto) { ... }

  @Get('indicators')                    // 全ロール
  getIndicators(@Query() query: ChartIndicatorsQueryDto) { ... }

  @Get('trades')                        // 全ロール
  getTrades(@Query() query: ChartTradesQueryDto) { ... }

  @Get('pattern-markers')               // 全ロール（ロール別フィルタはサービス層で実施）
  getPatternMarkers(@Query() query: ChartPatternMarkersQueryDto) { ... }

  @Get('prediction-overlay')
  @Roles('PRO', 'PRO_PLUS', 'ADMIN')   // PRO | PRO_PLUS | ADMIN のみ
  @UseGuards(RolesGuard)
  getPredictionOverlay(@Query() query: ChartPredictionOverlayQueryDto) { ... }
}
```

### 10.3 パターン検出 RBAC の実装位置

```typescript
// apps/api/src/chart/chart.service.ts

async getPatternMarkers(
  userId: string,
  userRole: UserRole,
  query: ChartPatternMarkersQuery,
): Promise<ChartPatternMarkersResponse> {
  // ロール別許可 patternCategory（Part 6 §1.0 分類体系・バックエンドで完結・フロント側フィルタ禁止）
  // FREE: CANDLESTICK のみ（PinBar / Engulfing / MorningStar / ShootingStar / Doji / ThreeSoldiers）
  // BASIC | PRO | PRO_PLUS | ADMIN: CANDLESTICK + FORMATION（全 12 種）
  const allowedCategories: string[] =
    userRole === 'FREE'
      ? ['CANDLESTICK']
      : ['CANDLESTICK', 'FORMATION'];

  const detections = await this.prisma.patternDetection.findMany({
    where: {
      userId,
      symbol:          query.symbol,
      timeframe:       query.timeframe,
      patternCategory: { in: allowedCategories },
    },
    orderBy: { detectedAt: 'desc' },
    take:    query.limit,
  });

  return {
    symbol:    query.symbol,
    timeframe: query.timeframe,
    markers:   detections.map(this.toPatternMarker),
  };
}
```

### 10.4 マイグレーション命名規則（Part 2 §4 準拠）

```bash
# Chart 専用テーブル追加
npx prisma migrate dev --name add_chart_tables

# 生成されるマイグレーションファイル:
# migrations/YYYYMMDDHHMMSS_add_chart_tables/migration.sql
# 含まれる DDL:
#   CREATE TABLE market_candles
#   CREATE TABLE indicator_cache
#   CREATE TABLE pattern_detections
#   CREATE TABLE chart_snapshots
#   ALTER TABLE users ADD COLUMN (relation 管理は Prisma が自動生成)
```

### 10.5 Redis キャッシュキー命名規則

```
chart:meta:{symbol}:{timeframe}
  例: chart:meta:EURUSD:H1

chart:candles:{symbol}:{timeframe}:{limit}:{before_or_now}
  例: chart:candles:EURUSD:H1:100:2025-03-01T00:00:00Z

chart:indicators:{symbol}:{timeframe}
  例: chart:indicators:EURUSD:H4

chart:patterns:{symbol}:{timeframe}:{role}
  例: chart:patterns:EURUSD:H4:FREE
  例: chart:patterns:EURUSD:H4:PRO
```

> `chart:patterns` のキーにはロール（`FREE` または それ以外をまとめた `PAID`）を含め、
> ロール別フィルタ後のキャッシュを分離する。

### 10.6 v5.1 実装上の注意事項

1. **prediction-overlay は常にスタブを返す。** `STUB_PREDICTION_RESULT`（Part 8 §9.3）を `mapStubToOverlay()` で変換して返す。変換ルールは §3.6 の変換表に従う。DTW / HMM のコードを書かない。
2. **chart-notes は永続化しない。** `chart_snapshots` テーブルは定義・マイグレーションのみ行い、v5.1 では `notes = null` / `trade_id = null` で保存する。chart-notes の読み書きは React state のみ。
3. **フロントでのパターンフィルタは禁止。** `GET /api/v1/chart/pattern-markers` のロール別フィルタはサービス層で完結させる（Part 1 §0-16）。フィルタキーは `patternCategory: { in: allowedCategories }` を使う。
4. **パターン名称は Part 6 §1.0 の正式名称のみ使用する。** `PinBar / Engulfing / MorningStar / ShootingStar / Doji / ThreeSoldiers`（CANDLESTICK）および `DoubleBottom / DoubleTop / HeadAndShoulders / Triangle / Flag / CupAndHandle`（FORMATION）が正式名称。`Hammer` / `Bullish Engulfing` / `Inverse Head and Shoulders` 等の別称は使用しない。
5. **`/api/chart/*` は使用しない。** すべて `/api/v1/chart/*` に統一する（Part 1 §0-17）。
6. **コアテーブルを再定義しない。** `trades` / `snapshots` / `signals` 等のコアテーブルは本 Part の Prisma Schema に含めない。`chart/trades` エンドポイントは既存の `trades` テーブルを参照するだけ。

---

*SPEC-v5.1 Part 11 確定（正本 rev.3 — 4点修正適用済）*
*修正1: pattern-markers パターン体系を Part 6 §1.0 正式名称・分類に完全一致（CANDLESTICK / FORMATION）*
*修正2: prediction-overlay の STUB 変換ルールを §3.6 に明記（Part 8 STUB_PREDICTION_RESULT → Chart API レスポンス マッピング表）*
*修正3: Part 10 §13 の旧表記 `/api/chart/` に対する読み替え宣言を §1.2a に追記（正本は `/api/v1/chart/*`）*
*修正4: horizonBars→forecastHorizonH 変換の根拠（48h→24h 表示の設計上の判断・v6 での動的計算への移行）を明記*
*Chart 専用 API: GET /api/v1/chart/{meta|candles|indicators|trades|pattern-markers|prediction-overlay}*
*Chart 専用 DB: market_candles / indicator_cache / pattern_detections / chart_snapshots*
*prediction-overlay: v5.1 = STUB_PREDICTION_RESULT を mapStubToOverlay() で変換。DTW / HMM は v6。*
