# FX Discipline Engine — 統合仕様書 v5.1
## SPEC-v5.1 / Part 6 : チャートパターン検出仕様 · バックテスト · フィボナッチ · エリオット波動

> **Part 6 の権限ルール**: バックエンドでロール判定して返却データをフィルタリングする。
> フロント側でのパターンフィルタリング禁止（RBAC はバックエンドで完結）。

---

## 0. 数値ラベルルール（完全統一版）

> **Part 6 の数値ラベル運用ルール**
> - `[SPEC]` : 設計定数・閾値・計算式・実装条件。
> - `[SAMPLE]` : 設計時のサンプル値。実測値ではない。
> - `[MEASURED]` : 実データ測定値。
> - `[KPI_TARGET]` : 目標値。
>
> 本 Part に記載される数値は、本文・表・箇条書き・コードコメントを含め、
> **必ず `[SPEC]` / `[SAMPLE]` / `[MEASURED]` / `[KPI_TARGET]` のいずれかで明示すること。**
> ラベルなし数値は禁止する。

---

## 0.1 ScoreBand 定義（全章共通・確定値）

> 本 Part 全章を通じて ScoreBand の数値ラベル・色・閾値は以下の定義を唯一の正本とする。
> Part 5 § 2.3・Part 10・ワイヤーフレーム（FXDE_v51_wireframe_integrated.html）の定義と完全に一致する。

```typescript
// packages/shared/src/score-band.ts

export type ScoreBand = 'HIGH' | 'MID' | 'LOW';

/**
 * スコア値から ScoreBand を返す。
 * HIGH : score >= 75  → カラートークン --score-high  (#2EC96A)  [SPEC]
 * MID  : score >= 50  → カラートークン --score-mid   (#E8B830)  [SPEC]
 * LOW  : score <  50  → カラートークン --score-low   (#E05252)  [SPEC]
 */
export function getScoreBand(score: number): ScoreBand {
  if (score >= 75) return 'HIGH';   // [SPEC]
  if (score >= 50) return 'MID';    // [SPEC]
  return 'LOW';                     // [SPEC]
}

/** ScoreBand → CSS カラートークン対応表 [SPEC] */
export const SCORE_BAND_COLOR: Record<ScoreBand, string> = {
  HIGH: '#2EC96A',  // --score-high  [SPEC]
  MID:  '#E8B830',  // --score-mid   [SPEC]
  LOW:  '#E05252',  // --score-low   [SPEC]
};
```

| ScoreBand | スコア範囲 | CSS トークン | カラーコード | 用途 |
|-----------|----------|------------|------------|------|
| `HIGH` | 75 以上 [SPEC] | `--score-high` | `#2EC96A` | 緑・エントリー推奨域 |
| `MID`  | 50〜74 [SPEC] | `--score-mid`  | `#E8B830` | 黄・待機域 |
| `LOW`  | 49 以下 [SPEC] | `--score-low`  | `#E05252` | 赤・エントリー不可域 |

---

## 0.2 EntryState 定義（全章共通・確定値）

> 本 Part 全章を通じて EntryState の列挙値・背景色・アクセントカラー・行動指示テキストは
> 以下の定義を唯一の正本とする。
> Part 5 § 2.2・Part 10・ワイヤーフレームの定義と完全に一致する。

```typescript
// packages/shared/src/entry-state.ts

export type EntryState =
  | 'ENTRY_OK'   // 全条件クリア → エントリー可                    [SPEC]
  | 'SCORE_LOW'  // スコア閾値未満 → 待機                          [SPEC]
  | 'RISK_NG'    // RR < 1.0 または損失率超過 → エントリー禁止      [SPEC]
  | 'LOCKED'     // 強制ロック（手動または指標前後）→ エントリー禁止  [SPEC]
  | 'COOLDOWN';  // クールダウン中 → タイマー表示                    [SPEC]
```

| EntryState | 背景色 | アクセント | 行動指示テキスト | ボタン挙動 |
|-----------|--------|----------|--------------|----------|
| `ENTRY_OK`  | `#1A4A2E` [SPEC] | `#2EC96A` [SPEC] | ✅ ENTRY OK | 緑・有効 |
| `SCORE_LOW` | `#3A3010` [SPEC] | `#E8B830` [SPEC] | 🟡 WAIT | ロック（クリックで振動）|
| `RISK_NG`   | `#4A1010` [SPEC] | `#E05252` [SPEC] | ⚠️ RISK NG | ロック |
| `LOCKED`    | `#1A1A2E` [SPEC] | `#4D9FFF` [SPEC] | 🔒 LOCKED | グレー・無効 |
| `COOLDOWN`  | `#3A1A00` [SPEC] | `#FB923C` [SPEC] | ⏳ COOLDOWN | タイマー表示 |

**EntryDecision 優先順（変更禁止）**

```
forceLock > cooldown > eventLock > riskNg > scoreLow  [SPEC]
```

---

## 1. チャートパターン検出仕様（完全版）

> パターン検出ロジックは `apps/api/src/score/pattern-detector.ts` に実装。
> スコアボーナス加算ルールは Part 4「1.6 チャートパターンボーナス」と必ず整合させること。

### 1.0 プラン別アクセス制限（RBAC）

| パターン分類 | 具体的パターン | FREE | BASIC 以上 |
|------------|-------------|:----:|:---------:|
| **ローソク足（6種）** | PinBar / Engulfing / MorningStar / ShootingStar / Doji / ThreeSoldiers | ✅ | ✅ |
| **フォーメーション（6種）** | DoubleBottom / DoubleTop / HeadAndShoulders / Triangle / Flag / CupAndHandle | ❌ | ✅ |

> **実装規則**: `PatternService.detect()` は全 12 種を内部計算するが、
> レスポンス返却時にロールを確認し FREE の場合は `CANDLESTICK` 種別のみ返す。
> フロント側でのフィルタリングは行わない（RBAC はバックエンドで完結させる）。

---

### 1.1 パターン分類体系

```
PatternCategory
  ├── FORMATION（フォーメーション）  複数本のローソク足で形成 → ボーナス大
  └── CANDLESTICK（ローソク足）      1〜3本の短期サイン     → ボーナス小
```

---

### 1.2 フォーメーションパターン（6 種）

#### ① ダブルボトム / ダブルトップ

```
BUY サイン（ダブルボトム）:
  高値 ──── ネックライン（確定トリガー）
    \  /\  /
     \/  \/
    底①  底②（底①と同水準 ±0.3%） [SAMPLE]
```

**検出アルゴリズム**

```typescript
function detectDoubleBottom(candles: Candle[]): PatternResult | null {
  // 1. 直近 60 本の中から局所安値（前後 5 本より安値）を抽出
  const localLows = findLocalLows(candles, window=5);
  if (localLows.length < 2) return null;

  // 2. 直近2つの安値を取得
  const [low1, low2] = localLows.slice(-2);

  // 3. 底値水準の一致確認（±0.3% 以内） [SAMPLE]
  const priceDiff = Math.abs(low1.price - low2.price) / low1.price;
  if (priceDiff > 0.003) return null;

  // 4. ネックライン（2底の間の高値）を確定
  const neckline = findMaxBetween(candles, low1.index, low2.index);

  // 5. 現在価格がネックラインを上抜けしているか
  const lastClose = candles[candles.length - 1].close;
  if (lastClose <= neckline) return null;

  // 6. 目標値・SL 計算
  const height   = neckline - Math.min(low1.price, low2.price);
  const target   = neckline + height;       // ネックライン上抜け + 値幅
  const stopLoss = Math.min(low1.price, low2.price) * 0.999; // 底値直下

  // 7. EntryState は § 0.2 定義に従い evaluateEntryDecision() で決定する
  return {
    name:       'DoubleBottom',
    category:   'FORMATION',
    direction:  'BUY',
    confidence: calcPatternConfidence({ /* ... */ }),
    bonus:      12,    // [SPEC]
    target,
    stopLoss,
    minConfidence: 0.65, // [SPEC]
  };
}
// ボーナス: +12 [SPEC] / 最低信頼度: 65% [SPEC]
```

#### ② ヘッドアンドショルダー（H&S）

```
SELL サイン（H&S トップ）:
    左肩  頭  右肩
     /\  /\  /\
    /  \/  \/  \
  ────── ネックライン ──────（下抜けで確定）
```

**検出条件**

```typescript
// 検出基準 [SPEC]
// ・左肩 < 頭（頭が最高点）
// ・右肩 ≈ 左肩（±2% 以内）[SAMPLE]
// ・ネックライン下抜けで確定
// ・左肩〜右肩の水平距離: 最低 20 本以上 [SPEC]

// ボーナス: +15 [SPEC] / 最低信頼度: 70% [SPEC]
```

#### ③ トライアングル（上昇・下降・シンメトリカル）

```typescript
// 上昇トライアングル（BUY バイアス）:
//   高値水平（抵抗線）+ 安値切り上げ → 上抜けで確定
// 下降トライアングル（SELL バイアス）:
//   安値水平（支持線）+ 高値切り下げ → 下抜けで確定
// シンメトリカル（方向性なし）:
//   高値切り下げ + 安値切り上げ → ブレイク方向で確定

// ボーナス: +10 [SPEC] / 最低信頼度: 60% [SPEC]
```

#### ④ フラッグ / ペナント

```
BUY サイン（ブルフラッグ）:
  ポール（急上昇）→ 旗部分（小幅調整・平行チャネル下降）→ 上抜け

検出条件 [SPEC]:
  ポール期間: 5〜20 本 [SAMPLE]
  旗期間:     10〜30 本 [SAMPLE]
  旗の逆行率: ≤ 50% of ポール高さ [SAMPLE]
  ブレイク: 旗の上限ラインを終値で超過

// ボーナス: +8 [SPEC] / 最低信頼度: 60% [SPEC]
```

#### ⑤ カップアンドハンドル

```
BUY サイン:
  ─────    ─────
  底丸みカップ + 小幅押し目（ハンドル）→ 右肩上抜け

検出条件 [SPEC]:
  カップ深さ: 15〜50% [SAMPLE]
  カップ期間: 30〜100 本 [SAMPLE]
  ハンドル: カップ深さの 10〜50% 以内 [SAMPLE]

// ボーナス: +12 [SPEC] / 最低信頼度: 65% [SPEC]
```

#### ⑥ ライジングウェッジ（弱気）

```
SELL サイン:
  高値切り上げ + 安値切り上げ（高値よりも緩やか）→ 下抜け

検出条件 [SPEC]:
  期間: 20〜60 本 [SAMPLE]
  高値・安値の傾きは同方向だが安値傾きが急 [SPEC]

// ボーナス: +8 [SPEC] / 最低信頼度: 60% [SPEC]
```

---

### 1.3 ローソク足パターン（6 種）

#### ① ピンバー（Pin Bar）

```typescript
function detectPinBar(candle: Candle): boolean {
  const bodySize  = Math.abs(candle.close - candle.open);
  const totalSize = candle.high - candle.low;

  // 実体が全体の 33% 以下 [SPEC]
  if (bodySize / totalSize > 0.33) return false;

  const upperWick = candle.high - Math.max(candle.open, candle.close);
  const lowerWick = Math.min(candle.open, candle.close) - candle.low;

  // 上ヒゲ or 下ヒゲが実体の 2 倍以上 [SPEC]
  return upperWick >= bodySize * 2 || lowerWick >= bodySize * 2;
}
// ボーナス: +8 [SPEC] / 最低信頼度: 60% [SPEC]
```

#### ② エンゴルフィング（Engulfing）

```typescript
function detectEngulfing(c1: Candle, c2: Candle, direction: 'BUY' | 'SELL'): boolean {
  if (direction === 'BUY') {
    // 強気エンゴルフィング: c1 陰線、c2 陽線で c1 全体を包む
    return c1.close < c1.open &&
           c2.close > c2.open &&
           c2.open  <= c1.close &&
           c2.close >= c1.open;
  } else {
    // 弱気エンゴルフィング
    return c1.close > c1.open &&
           c2.close < c2.open &&
           c2.open  >= c1.close &&
           c2.close <= c1.open;
  }
}
// ボーナス: +6 [SPEC] / 最低信頼度: 65% [SPEC]
```

#### ③ 明けの明星 / 宵の明星（Morning Star / Evening Star）

```typescript
function detectMorningStar(c1: Candle, c2: Candle, c3: Candle): boolean {
  // c1: 大陰線 / c2: 小実体（ギャップ）/ c3: 大陽線（c1 の中心以上まで回復）
  const c1Body = c1.open - c1.close;
  const c3Body = c3.close - c3.open;
  return c1Body > 0 &&                             // c1 陰線
         Math.abs(c2.close - c2.open) < c1Body * 0.3 && // c2 小実体 [SAMPLE]
         c3Body > 0 &&                             // c3 陽線
         c3.close >= c1.open - c1Body * 0.5;       // c1 中心以上回復 [SPEC]
}
// ボーナス: +8 [SPEC] / 最低信頼度: 65% [SPEC]
```

#### ④ シューティングスター（Shooting Star）

```typescript
function detectShootingStar(candle: Candle): boolean {
  const bodySize  = Math.abs(candle.close - candle.open);
  const totalSize = candle.high - candle.low;
  const upperWick = candle.high - Math.max(candle.open, candle.close);
  const lowerWick = Math.min(candle.open, candle.close) - candle.low;

  // 上ヒゲが実体の 2 倍以上 [SPEC]
  // 下ヒゲが上ヒゲの 25% 以下 [SPEC]
  return upperWick >= bodySize * 2 &&
         lowerWick <= upperWick * 0.25 &&
         bodySize  / totalSize <= 0.33;  // [SPEC]
}
// ボーナス: +6 [SPEC] / 最低信頼度: 60% [SPEC]
```

#### ⑤ ドージ（Doji）

```typescript
function detectDoji(candle: Candle): boolean {
  const bodySize  = Math.abs(candle.close - candle.open);
  const totalSize = candle.high - candle.low;
  // 実体が全体の 5% 以下 [SPEC]
  return totalSize > 0 && bodySize / totalSize <= 0.05;
}
// ボーナス: +4 [SPEC] / 最低信頼度: 55% [SPEC]
```

#### ⑥ 三兵（Three Soldiers / Three Crows）

```typescript
function detectThreeSoldiers(c1: Candle, c2: Candle, c3: Candle, direction: 'BUY' | 'SELL'): boolean {
  if (direction === 'BUY') {
    // 三白兵: 3 本連続陽線、各足が前足の実体内スタート・高値更新
    return (
      c1.close > c1.open && c2.close > c2.open && c3.close > c3.open &&
      c2.open > c1.open && c2.open < c1.close &&  // 前足実体内スタート
      c3.open > c2.open && c3.open < c2.close &&
      c2.close > c1.close && c3.close > c2.close  // 高値更新
    );
  } else {
    // 三羽カラス: 3 本連続陰線
    return (
      c1.close < c1.open && c2.close < c2.open && c3.close < c3.open &&
      c2.open < c1.open && c2.open > c1.close &&
      c3.open < c2.open && c3.open > c2.close &&
      c2.close < c1.close && c3.close < c2.close
    );
  }
}
// ボーナス: +6 [SPEC] / 最低信頼度: 70% [SPEC]
```

---

### 1.4 信頼度スコアの統一計算式

```typescript
// パターン共通の信頼度構成（4 要素加重平均）
export function calcPatternConfidence(params: {
  shapeScore:   number;  // 形状一致度 0.0〜1.0 [SPEC]（重み 40% [SPEC]）
  volumeScore:  number;  // 出来高確認 0.0〜1.0 [SPEC]（重み 20% [SPEC]）
                         //   FX の出来高は Tick Volume（約定回数）で代替する [SPEC]
                         //   算出: tickVolume(現在足) / tickVolume(直近 20 本平均) を 0〜1 に正規化 [SPEC]
                         //   Tick Volume が取得できない場合は 0.5 を使用する（中立値 fallback） [SPEC]
  htfScore:     number;  // 上位足一致 0.0〜1.0 [SPEC]（重み 20% [SPEC]）
  levelScore:   number;  // キーレベル近接 0.0〜1.0 [SPEC]（重み 20% [SPEC]）
}): number {
  const { shapeScore, volumeScore, htfScore, levelScore } = params;
  return (
    shapeScore  * 0.40 +
    volumeScore * 0.20 +
    htfScore    * 0.20 +
    levelScore  * 0.20
  );
}

/**
 * volumeScore 算出ヘルパー [SPEC]
 * FX は真の出来高を持たないため Tick Volume（tickCount）で代替する。
 * tickCount が存在しない場合は VOLUME_FALLBACK を返す。
 */
const VOLUME_FALLBACK = 0.5; // [SPEC] 中立値（情報なし扱い）

export function calcVolumeScore(
  currentTickVolume: number | null,
  recentTickVolumes: number[],  // 直近 20 本 [SPEC]
): number {
  if (currentTickVolume === null || recentTickVolumes.length === 0) {
    return VOLUME_FALLBACK;  // Tick Volume 未取得時は中立値 [SPEC]
  }
  const avg = recentTickVolumes.reduce((s, v) => s + v, 0) / recentTickVolumes.length;
  if (avg === 0) return VOLUME_FALLBACK;
  // 平均比を 0〜1 にクリップ（2 倍以上を 1.0 とみなす） [SPEC]
  return Math.min(currentTickVolume / avg / 2, 1.0);
}
```

---

### 1.5 パターン競合ルール

```typescript
// 同時複数検出時のボーナス採用ルール
export function resolvePatternConflicts(patterns: PatternResult[]): PatternResult | null {
  const eligible = patterns.filter(p => p.confidence >= p.minConfidence);
  if (eligible.length === 0) return null;

  const reversalPatterns     = eligible.filter(p => REVERSAL_PATTERNS.includes(p.name));
  const continuationPatterns = eligible.filter(p => CONTINUATION_PATTERNS.includes(p.name));

  // 反転と継続が競合 → 判断不能 → ボーナスなし
  if (reversalPatterns.length > 0 && continuationPatterns.length > 0) return null;

  // 同一方向のパターン → 最高点のみ採用（上限 15 点） [SPEC]
  return eligible.reduce((best, p) =>
    p.bonus > best.bonus ? p : best
  , eligible[0]);
}

const REVERSAL_PATTERNS     = ['DoubleBottom','DoubleTop','HeadAndShoulders','MorningStar','EveningStar'];
const CONTINUATION_PATTERNS = ['Flag','Triangle_ascending','CupAndHandle','ThreeSoldiers'];
// ※ Pennant は v5.1 で検出アルゴリズム未定義のため除外する。v6 以降で追加する。 [SPEC]
```

---

## 2. バックテスト仕様（完全版）

> **数値ラベル凡例**
> - `[SPEC]` : 設計定数・閾値・判定条件・計算式。
> - `[SAMPLE]` : 設計時のサンプル値。実際の計算結果ではない。UI 表示・テストのモックデータとして使用可。
> - `[MEASURED]` : 実際のバックテスト計算で得た実測値（v6 以降）。
> - `[KPI_TARGET]` : v5.1 PoC の目標値。達成を保証するものではない。
> ラベルなし数値は禁止。

### 2.1 バックテスト総合結果（2015〜2025 年）

| 指標 | 値 | 説明 |
|------|-----|------|
| 総合勝率 | 58.4% [SAMPLE] | 勝ちトレード / 全トレード |
| プロフィットファクター（PF） | 1.62 [SAMPLE] | 総利益 / 総損失 |
| 最大ドローダウン（MDD） | −12.3% [SAMPLE] | 口座の最大下落率 |
| DD 回復日数（平均） | 34 日 [SAMPLE] | MDD から回復するまでの平均日数 |
| 年平均リターン | +28.4% [SAMPLE] | 複利換算 |
| 総トレード数 | 1,847 回 [SAMPLE] | 10 年間合計 |
| 平均 RR 比 | 1.31 [SAMPLE] | 実現した RR 比の平均 |

**パターン検出追加後の改善**

```
v3 まで PF: 1.62 [SAMPLE]
v4（パターン加算後）PF: 1.84 [SAMPLE]  → +13.6% [SAMPLE] 改善

パターン確認なし: 勝率 54.2% [SAMPLE]
パターン確認あり: 勝率 64.7% [SAMPLE]
差分: +10.5 ポイント [SAMPLE]
```

### 2.2 主要指標の算出式

```typescript
// packages/shared/src/backtest-metrics.ts

export function calcProfitFactor(trades: Trade[]): number {
  const wins   = trades.filter(t => (t.pnl ?? 0) > 0).reduce((s,t) => s + Number(t.pnl), 0);
  const losses = trades.filter(t => (t.pnl ?? 0) < 0).reduce((s,t) => s + Math.abs(Number(t.pnl)), 0);
  return losses === 0 ? Infinity : wins / losses;
}

export function calcMaxDrawdown(equityCurve: number[]): number {
  let peak = equityCurve[0];
  let mdd  = 0;
  for (const equity of equityCurve) {
    if (equity > peak) peak = equity;
    const dd = (equity - peak) / peak;
    if (dd < mdd) mdd = dd;
  }
  return mdd * 100; // % 表示
}

export function calcSharpeRatio(returns: number[], riskFreeRate = 0): number {
  const avg = returns.reduce((s, r) => s + r, 0) / returns.length;
  const std = Math.sqrt(
    returns.reduce((s, r) => s + Math.pow(r - avg, 2), 0) / returns.length
  );
  return std === 0 ? 0 : (avg - riskFreeRate) / std;
}

export function calcRecoveryFactor(totalReturn: number, mdd: number): number {
  return mdd === 0 ? Infinity : totalReturn / Math.abs(mdd);
}
```

### 2.3 相場環境別バックテスト

#### 4 種の相場環境定義

| 環境 | 識別条件 | 対応方針 |
|------|---------|---------|
| トレンド相場 | ADX > 25 かつ価格が MA の同一側 [SPEC] | ✅ 最適（システム全機能発揮）|
| 高ボラ相場 | ATR が通常の 1.5 倍以上 [SPEC] | ⚠️ ロット縮小・SL 拡大 |
| 低流動性相場 | 東京深夜〜早朝 0:00〜7:00 JST [SPEC] | ⚠️ 回避推奨 |
| レンジ相場 | ADX < 20 かつ価格が BB 内 [SPEC] | 🔴 回避（PF < 1.0）|

#### ADX 算出式

```typescript
function calcAdx(candles: Candle[], period = 14): number {  // period [SPEC]
  const trueRanges = candles.slice(1).map((c, i) => {
    const prev = candles[i];
    return Math.max(
      c.high - c.low,
      Math.abs(c.high - prev.close),
      Math.abs(c.low  - prev.close),
    );
  });

  const plusDM = candles.slice(1).map((c, i) => {
    const prev = candles[i];
    const up   = c.high - prev.high;
    const down = prev.low - c.low;
    return (up > down && up > 0) ? up : 0;
  });

  const minusDM = candles.slice(1).map((c, i) => {
    const prev = candles[i];
    const up   = c.high - prev.high;
    const down = prev.low - c.low;
    return (down > up && down > 0) ? down : 0;
  });

  const atr14   = ema(trueRanges, period);
  const plusDI  = ema(plusDM, period).map((v, i) => v / atr14[i] * 100);
  const minusDI = ema(minusDM, period).map((v, i) => v / atr14[i] * 100);
  const dx      = plusDI.map((v, i) =>
    Math.abs(v - minusDI[i]) / (v + minusDI[i]) * 100
  );
  return ema(dx, period).slice(-1)[0];
}
```

#### バックテスト結果（環境別）

| 環境 | 勝率 | PF | 判定 |
|------|------|-----|------|
| トレンド相場 | 67.2% [SAMPLE] | 2.14 [SAMPLE] | ✅ 最強 |
| 高ボラ相場 | 51.3% [SAMPLE] | 1.24 [SAMPLE] | ⚠️ 注意 |
| 低流動性 | 49.8% [SAMPLE] | 1.08 [SAMPLE] | ⚠️ 回避推奨 |
| レンジ相場 | 44.8% [SAMPLE] | 0.92 [SAMPLE] | 🔴 回避（PF < 1.0）|
| 指標発表週 | 47.6% [SAMPLE] | 1.01 [SAMPLE] | 🔴 回避推奨 |

> レンジ相場での PF = 0.92 [SAMPLE] < 1.0 → 長期的にマイナス（サンプルデータ基準）。
> この実績 [SAMPLE] がスコアに「レンジ相場ペナルティ（ADX < 20 時にスコア −5 点）[SPEC]」を組み込む根拠。

### 2.4 期待値ヒートマップ

**通貨ペア × 時間足 のマトリクス**

| ペア | M15 | H1 | H4 | D1 |
|-----|:---:|:--:|:--:|:--:|
| EURUSD | 🟡 | 🟢 | 🟢 | 🟢 |
| USDJPY | 🟡 | 🟢 | 🟢 | 🟡 |
| GBPUSD | 🔴 | 🟡 | 🟢 | 🟢 |
| AUDUSD | 🔴 | 🟡 | 🟡 | 🟢 |
| USDCAD | 🔴 | 🟡 | 🟢 | 🟡 |
| USDCHF | 🟡 | 🟡 | 🟢 | 🟢 |
| NZDUSD | 🔴 | 🔴 | 🟡 | 🟡 |
| XAUUSD | 🔴 | 🟡 | 🟡 | 🟢 |

```
🟢 期待値 75% 以上 [SPEC]  → 推奨
🟡 期待値 50〜74% [SPEC]   → 普通（使用可）
🔴 期待値 50% 未満 [SPEC]  → 回避推奨
```

> ヒートマップのセル色は § 0.1 の ScoreBand カラーには連動しない。
> ヒートマップは「推奨度（🟢/🟡/🔴）」の表現であり、スコア数値とは別概念である。

**最推奨組み合わせ**: EURUSD × H4（本システムのメイン想定）

### 2.5 スコア帯別実績勝率（DB に保存・グラフ表示）

> スコア帯の区切りは § 0.1 ScoreBand 定義の閾値（75 / 50）と整合させること。
> 表示色は ScoreBand カラートークンを使用する（`HIGH` = `#2EC96A` / `MID` = `#E8B830` / `LOW` = `#E05252`）。

| スコア帯 | ScoreBand | 勝率 | 平均 RR | 期待値 / 回 |
|---------|----------|------|--------|-----------|
| 〜49 点 | `LOW` | 42.3% [SAMPLE] | 0.8 [SAMPLE] | −¥1,240 [SAMPLE] |
| 50〜74 点（60〜69 内訳） | `MID` | 52.1% [SAMPLE] | 1.1 [SAMPLE] | +¥480 [SAMPLE] |
| 50〜74 点（70〜74 内訳） | `MID` | 58.8% [SAMPLE] | 1.2 [SAMPLE] | +¥1,120 [SAMPLE] |
| **75〜79 点** | **`HIGH`** | **61.2% [SAMPLE]** | **1.3 [SAMPLE]** | **+¥2,180 [SAMPLE]** |
| 80〜89 点 | `HIGH` | 67.8% [SAMPLE] | 1.5 [SAMPLE] | +¥3,920 [SAMPLE] |
| 90 点〜 | `HIGH` | 71.4% [SAMPLE] | 1.8 [SAMPLE] | +¥5,640 [SAMPLE] |

> この表は PG-03 Strategy（旧 PG-06 設定・旧 PG-02 パターン分析）の「スコア帯別損益グラフ」に表示する。
> PG 番号は Part 10 § 4 の確定定義に従う。

#### API エンドポイント（参照）

```typescript
// GET /api/v1/trades/stats/by-score-band  ← 正式定義: Part 3 § 11
interface ScoreBandStats {
  band:       string;    // 例: "75-79" [SAMPLE]
  scoreBand:  ScoreBand; // 'HIGH' | 'MID' | 'LOW'  [SPEC]
  avgPnl:     number;    // 平均損益 / 回
  winRate:    number;    // 勝率 %
  tradeCount: number;
}
```

---

## 3. フィボナッチリトレースメント仕様

### 3.1 計算式

```typescript
// packages/shared/src/fibonacci.ts

export interface FibLevel {
  ratio:  number;  // 0.236 / 0.382 / 0.500 / 0.618 / 0.786 [SPEC]
  price:  number;
  label:  string;  // 例: "61.8%" [SAMPLE]
  isKey:  boolean; // 重要水準か（38.2 / 61.8 / 78.6 [SPEC] が true）
}

export function calcFibLevels(high: number, low: number, uptrend: boolean): FibLevel[] {
  const RATIOS = [0.236, 0.382, 0.500, 0.618, 0.786]; // [SPEC]
  const KEY    = [0.382, 0.618, 0.786]; // [SPEC]

  return RATIOS.map(ratio => ({
    ratio,
    price: uptrend
      ? high - (high - low) * ratio   // 上昇後の押し目
      : low  + (high - low) * ratio,  // 下落後の戻し
    label: `${(ratio * 100).toFixed(1)}%`,
    isKey: KEY.includes(ratio),
  }));
}
```

### 3.2 なぜ 61.8% が最重要か [SAMPLE]

```
黄金比 φ = (1 + √5) / 2 ≈ 1.618

フィボナッチ数列の隣接比の収束:
  34 / 55  = 0.6182
  55 / 89  = 0.6180
  89 / 144 = 0.6181  ← 0.618 に収束

自然界・建築・美術・金融市場に繰り返し現れる比率。
市場参加者が「61.8% ラインで反転しやすい」と信じることで [SAMPLE]
自己実現的に機能する傾向がある。
```

### 3.3 チャート SVG への描画仕様

```
各フィボレベルを水平線で描画:
  23.6%: stroke #B07EFF, opacity 0.3, strokeDasharray "2 4" [SAMPLE]
  38.2%: stroke #B07EFF, opacity 0.5, strokeDasharray "3 3"（KEY） [SAMPLE]
  50.0%: stroke #B07EFF, opacity 0.4, strokeDasharray "3 3" [SAMPLE]
  61.8%: stroke #B07EFF, opacity 0.9, strokeWidth 1.5（KEY・最重要） [SAMPLE]
  78.6%: stroke #B07EFF, opacity 0.6, strokeDasharray "3 3"（KEY） [SAMPLE]

ラベル（右端）: "Fib 61.8%" テキスト（小フォント・右揃え） [SAMPLE]
```

---

## 4. エリオット波動カウント仕様

### 4.1 基本ルール

```
上昇サイクル（推進 5 波 + 修正 3 波）:

推進波:
  ①波: 最初の上昇（始まり）
  ②波: ①の修正（通常 ①の 38.2〜61.8% [SAMPLE] 戻し）
  ③波: 最強の上昇（①の 1.618 倍以上 [SAMPLE] が多い）← 最大利幅
  ④波: ③の修正（①波のトップを侵犯しない）
  ⑤波: 最終上昇（ダイバージェンス出やすい）

修正波（ABC）:
  A 波: 最初の下落
  B 波: 反発（フェイク上昇）
  C 波: 最終下落
```

### 4.2 波動別エントリー戦略

| 波動 | EntryState | 期待利幅 | リスク |
|------|-----------|---------|-------|
| ②波の終わり | `ENTRY_OK`（条件クリア時）| 大（③波全体） | 中 |
| ③波の途中 | `ENTRY_OK`（条件クリア時）| 中〜大 | 低 |
| ④波の終わり | `SCORE_LOW` 〜 `ENTRY_OK` | 中（⑤波のみ） | 高 |
| B 波の終わり（SELL）| `ENTRY_OK`（条件クリア時）| 中（C 波） | 中 |

> EntryState の最終判定は evaluateEntryDecision() が行う。§ 0.2 の優先順に従う。

### 4.3 フィボナッチとの組み合わせ

```
②波の最終地点目安:
  ①波の 38.2% 〜 61.8% 戻しゾーンが高確率 [SAMPLE]

③波の目標値:
  ①波の 1.618 倍 [SAMPLE]（最多）
  ①波の 2.618 倍 [SAMPLE]（延長波の場合）

④波の戻し目安:
  ③波の 23.6% 〜 38.2%（深い戻しは禁止：①波トップを下回らない） [SAMPLE]
```

### 4.4 信頼度の扱い

```
波動カウントは主観的要素が強く、複数の解釈が存在する。
本システムでは「推定現在地」として表示し、確定情報とは扱わない。

信頼度目安: 40〜70% [SPEC]
→ 他の指標（RSI ダイバージェンス・パターン・MTF）との
  複合一致時のみスコアに組み込む（ProOnly 表示）
```

### 4.5 エリオット波動表示の配置

> エリオット波動カウントは PG-03 Strategy（Part 10 § 4 確定）の ProOnly コンポーネントとして表示する。
> 旧 PG-02（Patterns）・旧 PG-04（Validation）は廃止済み（Part 10 § 1.1 参照）。

---

## 5. v5.1 実装境界（Prediction Engine）

> **⚠️ 本章は v5.1 実装境界の明示である。**
> Part 6 内にパターン検出・バックテスト・フィボナッチ・エリオット波動の記述があるが、
> これらは v5.1 実装対象である。

### 5.1 v5.1 で実装するもの（本 Part 対象）

| 機能 | 実装場所 | 備考 |
|------|---------|------|
| パターン検出 12 種 | `apps/api/src/score/pattern-detector.ts` | § 1 の全アルゴリズム |
| バックテスト指標算出 | `packages/shared/src/backtest-metrics.ts` | PF / MDD / Sharpe 等 |
| フィボナッチ計算 | `packages/shared/src/fibonacci.ts` | § 3.1 |
| エリオット波動カウント表示 | PG-03 Strategy ProOnly | § 4 |

### 5.2 v5.1 で実装してはならないもの（v6 設計ドキュメント扱い）

> 以下の技術は **v6 設計ドキュメント** であり、v5.1 の実装対象外とする。
> コード例が本 SPEC 内の他 Part（Part 8 等）に存在しても、v5.1 では実装してはならない。

| 技術 | 分類 | 正本参照先 |
|------|------|----------|
| DTW（Dynamic Time Warping）類似局面検索 | v6 設計ドキュメント | Part 8 § 4（v6 設計資料） |
| HMM（隠れマルコフモデル）相場状態分類 | v6 設計ドキュメント | Part 8 § 5（v6 設計資料） |
| 特徴量ベクトル抽出・コサイン類似度 | v6 設計ドキュメント | Part 8 § 3（v6 設計資料） |
| ウォークフォワード検証（WFV）自動実行 | v6 設計ドキュメント | Part 8 § 6（v6 設計資料） |
| 時間足重みの自動学習（オンライン学習）| v6 設計ドキュメント | Part 8 § 7（v6 設計資料） |

> Prediction Engine 本体の v5.1 実装スコープは Part 8 § A.0 および § 0 を参照すること。

---

*Part 6 完了 — 次: Part 7 → 心理分析 · 履歴ログ · マルチペア · 設定画面 完全仕様*
