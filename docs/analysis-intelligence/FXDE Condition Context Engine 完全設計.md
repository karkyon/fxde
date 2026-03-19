FXDE Condition Context Engine 完全設計
1. 目的

Condition Context Engine の役割は、
「パターンが出た」瞬間の周辺状況を構造化して保存し、後から統計的に評価できるようにすること です。

これにより、単純な

Double Top は勝率何％

Triangle は平均何 pips

ではなく、

ロンドン時間の Double Top はどうか

上位足が上昇トレンド中の Triangle はどうか

低ボラ・高ボラで結果がどう変わるか

USDJPY/H1 で、H4 が下降中のときの Head & Shoulders はどうか

のような
複合条件付き信頼度 を出せるようにします。

2. このエンジンが解決する問題

現状の reliability は、ほぼ

pluginKey

patternType

symbol

timeframe

direction

程度に依存しています。

これでは「条件付き信頼性」と言っても浅いです。
本当に欲しいのは 検出時コンテキストの保存 です。

Condition Context Engine では、各 pattern event に対して

市場状態

時間条件

ボラティリティ条件

マルチタイムフレームの方向性

検出時の価格構造条件

を付与します。

3. 設計思想

原則は 3 つです。

3-1. detector と context は分離

pattern detector は
「何が出たか」だけに責任を持つ。

Condition Context Engine は
「そのとき周辺がどうだったか」 を計算する。

つまり

detector = event production

context engine = event enrichment

です。

3-2. 後から統計で切れる形で保存

context は文字列の雑なメモではなく、
集計可能な離散カテゴリ と 数値値 の両方で持つ。

例:

session = london

volatilityRegime = high

htfTrend = up

atrRatio = 1.42

3-3. 最初から全部やりすぎない

v1 は 統計に効く軸を先に固定 します。
最初の対象は次です。

時間帯

セッション

symbol

timeframe

direction

上位足トレンド

同一足トレンド

ATR/ボラ regime

pattern size / pattern quality

これで十分に価値が出ます。

4. エンジンの責務

Condition Context Engine の責務は次の 5 つです。

pattern event 入力を受ける

必要な candles / 上位足データを参照する

context を算出する

metadata/context を event に付与する

reliability 集計で利用可能な形で保存する

5. 全体アーキテクチャ
Pattern Detector
   ↓
Pattern Event
   ↓
Condition Context Engine
   ├─ time context
   ├─ market context
   ├─ trend context
   ├─ volatility context
   ├─ structure context
   └─ quality context
   ↓
Enriched Event
   ↓
Plugin Event Capture
   ↓
Evaluation / Result (pips, hit/miss, max favorable, max adverse)
   ↓
Reliability Scoring / Breakdown / Drilldown
6. データモデル
6-1. Enriched Pattern Event
type PatternEventContext = {
  time: {
    detectedAt: string
    hourOfDay: number
    dayOfWeek: number
    session: "asia" | "london" | "newyork" | "overlap" | "offhours"
  }

  market: {
    symbol: string
    baseAsset?: string
    quoteAsset?: string
    marketType: "fx" | "crypto" | "index" | "commodity" | "unknown"
  }

  timeframe: {
    current: string
    higher?: string
    lower?: string
  }

  trend: {
    currentTrend: "up" | "down" | "range" | "unknown"
    higherTrend: "up" | "down" | "range" | "unknown"
    lowerTrend?: "up" | "down" | "range" | "unknown"
    trendAlignment:
      | "aligned_bull"
      | "aligned_bear"
      | "mixed"
      | "range"
      | "unknown"
  }

  volatility: {
    atr: number | null
    atrPercent: number | null
    atrRegime: "low" | "normal" | "high" | "extreme" | "unknown"
    barRangePercentile?: number | null
  }

  structure: {
    recentSwingBias: "bullish" | "bearish" | "neutral" | "unknown"
    distanceFromRecentHighPct?: number | null
    distanceFromRecentLowPct?: number | null
    breakoutContext?: "pre_breakout" | "post_breakout" | "inside_range" | "unknown"
  }

  pattern: {
    patternType: string
    direction: "bullish" | "bearish" | "neutral" | "unknown"
    sizeBars?: number | null
    sizePips?: number | null
    widthBars?: number | null
    heightPips?: number | null
    qualityScore?: number | null
    symmetryScore?: number | null
    slopeScore?: number | null
  }
}
7. 最低限保存すべきコンテキスト項目
7-1. 時間コンテキスト
必須

detectedAt

hourOfDay

dayOfWeek

session

session 判定案

FX 前提なら JST でなく UTC ベースで固定判定するのがよいです。

例:

Asia: 00:00–07:59 UTC

London: 08:00–12:59 UTC

New York: 13:00–20:59 UTC

Overlap: London/NY overlap を別扱いでも可

内部的には UTC で計算し、表示だけローカル変換。

7-2. 市場コンテキスト
必須

symbol

marketType

余裕があれば

baseAsset

quoteAsset

例:

EURUSD → base=EUR, quote=USD

XAUUSD → commodity 扱い

BTCUSD → crypto 扱い

7-3. 時間足コンテキスト
必須

current timeframe

higher timeframe

推奨 higher timeframe mapping

M5 → M15

M15 → H1

H1 → H4

H4 → D1

D1 → W1

これを固定ルールで持つ。

7-4. トレンドコンテキスト

ここが超重要です。

必須

currentTrend

higherTrend

trendAlignment

trend 判定の v1

複雑すぎることはしない。
最初は一貫して次のいずれかで統一。

方式A

EMA20 と EMA50 の位置関係 + 傾き

方式B

過去 N 本の swing high / swing low

最初は実装の安定性から EMA20/50 + slope を推奨。

判定例:

EMA20 > EMA50 かつ EMA20 slope > 0 → up

EMA20 < EMA50 かつ EMA20 slope < 0 → down

それ以外 → range

trendAlignment

current=up / higher=up → aligned_bull

current=down / higher=down → aligned_bear

どちらか range → range

逆向き → mixed

7-5. ボラティリティコンテキスト
必須

atr

atrPercent

atrRegime

atrRegime 判定

直近 ATR を過去 N 本平均で正規化し regime を切る。

例:

< 0.7 → low

0.7–1.3 → normal

1.3–1.8 → high

>= 1.8 → extreme

ここは統計にかなり効きます。

7-6. 構造コンテキスト
必須

recentSwingBias

breakoutContext

recentSwingBias

直近の高値安値構造から

bullish

bearish

neutral

breakoutContext

レンジ内か

直近高値更新直後か

直近安値更新直後か

pattern の有効性にかなり関係します。

7-7. パターン品質コンテキスト

これは “Condition Context Engine” の価値を大きく上げます。

必須

patternType

direction

推奨

widthBars

heightPips

qualityScore

qualityScore の考え方

detector が返せるなら理想。
無理なら context engine 側で簡易評価。

例:

左右対称性

ネックラインの明瞭さ

パターン高低差の十分性

ノイズの少なさ

8. コンテキスト算出サービス構成

ファイル構成はこうするのがよいです。

apps/api/src/plugins-runtime/context/
  condition-context-engine.service.ts
  builders/
    time-context.builder.ts
    market-context.builder.ts
    timeframe-context.builder.ts
    trend-context.builder.ts
    volatility-context.builder.ts
    structure-context.builder.ts
    pattern-quality.builder.ts
  utils/
    trend.util.ts
    atr.util.ts
    session.util.ts
    timeframe-map.util.ts
9. 中核API
9-1. メイン関数
export type BuildConditionContextInput = {
  symbol: string
  timeframe: string
  candles: Candle[]
  detectedIndex: number
  patternType: string
  direction?: "bullish" | "bearish" | "neutral"
  patternMeta?: Record<string, unknown>
}

export class ConditionContextEngineService {
  async build(input: BuildConditionContextInput): Promise<PatternEventContext> {
    // 各 builder を統合
  }
}
9-2. 呼び出し位置

呼び出しは detector の内部ではなく、
pattern event を capture する直前 がベストです。

つまり流れは

detector が pattern event を出す

executor / adapter 層で context engine を呼ぶ

enriched event を event-capture へ渡す

10. 既存システムへの接続ポイント
10-1. auto-chart-pattern-engine.adapter.ts

ここで pattern 検出結果を返す際に、
各 event に context を付与する。

イメージ
const patterns = await runAutoChartPatternDetectors(candles)

const enriched = await Promise.all(
  patterns.map(async (pattern) => {
    const context = await conditionContextEngine.build({
      symbol,
      timeframe,
      candles,
      detectedIndex: pattern.detectedIndex,
      patternType: pattern.patternType,
      direction: pattern.direction,
      patternMeta: pattern.metadata,
    })

    return {
      ...pattern,
      metadata: {
        ...pattern.metadata,
        context,
      },
    }
  })
)
10-2. plugin-event-capture.service.ts

ここで metadata.context を保存対象に含める。

今の patternType / symbol / timeframe / direction / detectedAt だけでは浅いので、
context を丸ごと保持する。

10-3. reliability-scoring.service.ts

ここの condition breakdown を
metadata.context ベースで拡張する。

現状の patternType / symbol / timeframe / direction / hour に加えて

session

currentTrend

higherTrend

trendAlignment

atrRegime

recentSwingBias

breakoutContext

qualityBucket

を集計可能にする。

11. reliability 集計の設計
11-1. v1 で出す breakdown 軸

patternType

symbol

timeframe

direction

hourOfDay

session

currentTrend

higherTrend

trendAlignment

atrRegime

recentSwingBias

breakoutContext

11-2. v1.5 で追加

weekday

marketType

qualityBucket

sizeBucket

widthBucket

12. 複合条件スコアの考え方

ここが本丸です。

単一条件だけではなく、複合条件でも集計できるようにする。

例:

patternType=double_top AND session=london

patternType=triangle AND higherTrend=up

symbol=USDJPY AND timeframe=H1 AND atrRegime=high

head_shoulders AND aligned_bear AND breakoutContext=post_breakout

ただし v1 では全部を事前集計しない

組み合わせ爆発するため、最初は

単一軸集計

Drilldown API

UI 側フィルタで複合抽出

を採用する。

v2 でやること

使用頻度の高い組み合わせだけ materialized 集計する。

13. DB保存方針

DB に保存する event metadata に context を JSON で持たせる。

保存形
metadata: {
  patternType: "double_top",
  symbol: "USDJPY",
  timeframe: "H1",
  direction: "bearish",
  detectedAt: "2026-03-16T09:00:00.000Z",
  context: { ...PatternEventContext }
}
理由

柔軟

後方互換しやすい

v2 でフィールド追加しやすい

必要なら後で集計用派生カラムを追加する。

14. UI設計
14-1. ReliabilityLab

condition breakdown セクションを追加。

表示例:

Session別成績

HTF Trend別成績

ATR Regime別成績

Breakout Context別成績

各カードに

件数

hit率

平均pips

median pips

PF相当簡易値

を表示。

14-2. PluginDrilldown

event list に context column を追加。

最低限表示:

patternType

symbol

timeframe

session

higherTrend

atrRegime

resultPips

14-3. 将来の Condition Explorer

将来的には専用ページを作る。

/research/conditions

ここで

patternType

symbol

timeframe

session

higherTrend

atrRegime

を掛け合わせて分析できるようにする。

15. スコアリングとの統合

Condition Context Engine の最終目的は
「条件付き信頼度」 を作ることです。

v1

条件別統計を出すだけ

v2

検出イベントごとに condition-adjusted score を算出

例:

base pattern score
+ session bonus
+ higherTrend alignment bonus
+ atr regime penalty
+ quality score bonus
= final conditional confidence

この最終値を Chart 上に出せるようにする。

16. 実装順序

順番は固定でこれです。

Step 1

ConditionContext 型定義追加

Step 2

time / trend / volatility builder 実装

Step 3

adapter or executor で context を付与

Step 4

event capture に保存

Step 5

reliability scoring に breakdown 追加

Step 6

PluginDrilldown / ReliabilityLab 表示追加

Step 7

typecheck/build 通過

17. Claude にそのまま渡せる実装指示

以下をそのまま Claude に渡せます。

Claude実装指示 — Condition Context Engine

目的
FXDE の auto-chart-pattern-engine に対し、pattern 検出時の周辺状況を構造化保存する Condition Context Engine を追加する。
本実装は OANDA 実データ検証不要。理論上完成状態まで実装する。

変更対象

apps/api/src/plugins-runtime/context/ 以下を新設

apps/api/src/plugins-runtime/executor/auto-chart-pattern-engine.adapter.ts

apps/api/src/plugins-runtime/event-capture/plugin-event-capture.service.ts

apps/api/src/modules/plugins-ranking/service/reliability-scoring.service.ts

apps/web/src/pages/ReliabilityLab.tsx

apps/web/src/pages/PluginDrilldown.tsx

必要なら packages/types に型追加

必須要件

pattern event に metadata.context を付与すること

context には最低限以下を含めること

hourOfDay

session

current timeframe

higher timeframe

currentTrend

higherTrend

trendAlignment

atr

atrRegime

recentSwingBias

breakoutContext

reliability-scoring.service.ts に breakdown 軸を追加すること

session

currentTrend

higherTrend

trendAlignment

atrRegime

recentSwingBias

breakoutContext

ReliabilityLab / PluginDrilldown で context を表示できること

detector ロジックは変更しないこと

build/typecheck を通すこと

実装ルール

detector 内で context を計算しない

context 計算は専用 service/builder に分離する

metadata.context は JSON 構造で保持する

既存 API 契約を壊さない

推測でフィールド名を変えない

完了時の出力

追加/変更ファイル一覧

PatternEventContext 型

context build 部分

capture 保存部分

reliability breakdown 追加部分

typecheck/build 結果

18. この設計の価値

これを入れると FXDE は

「パターン検出アプリ」 ではなく
「条件付き統計学習型の裁量支援研究ツール」