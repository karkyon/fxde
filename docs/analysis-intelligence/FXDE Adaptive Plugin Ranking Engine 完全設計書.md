0. 目的

Adaptive Plugin Ranking Engine は、FXDE に組み込まれた各 plugin の実績を継続観測し、
その結果に基づいて plugin の信頼度を数値化し、以下を自動で行うエンジンである。

高精度 plugin を優先表示する

低精度 plugin の影響度を自動で下げる

一定条件を下回る plugin を自動停止候補にする

条件別に強い plugin を場面ごとに選別する

将来的な self-healing / self-optimization の基盤になる

本機能の本質は、
単に「plugin を並べる」ことではなく、
“今この相場条件で信用できる plugin を上に上げる” ことである。

1. 設計思想
1.1 単純な勝率ランキングでは不十分

plugin の有効性は単純な勝率だけでは判定できない。
たとえば

勝率は高いが値幅が小さい

勝率は低いがRRが高い

特定セッションだけ極端に強い

サンプル数が少ないのに高成績に見える

といったケースがある。

したがって本 engine は、複数指標を統合した reliability score で順位を決める。

1.2 全体評価 + 条件別評価 の二層構造

plugin 評価は 2 層で持つ。

Global Score
全期間・全条件での総合信頼度

Contextual Score
現在の相場条件に近い条件群での信頼度

最終順位はこの両方を使って決定する。

1.3 自動停止は即時停止ではなく段階制

低精度 plugin をいきなり完全無効化すると、相場環境変化への再適応余地を失う。
そのため段階的に制御する。

正常

降格

抑制

停止候補

自動停止

2. エンジン全体構成
Plugin Runtime
   ↓
Plugin Event Capture
   ↓
Plugin Result Evaluation
   ↓
Plugin Condition Aggregation
   ↓
Plugin Reliability Scoring
   ↓
Adaptive Ranking Engine
   ├─ Display Priority Control
   ├─ Execution Weight Control
   ├─ Auto Suppression Decision
   └─ Auto Stop Candidate Decision
3. 対象範囲
3.1 対象 plugin

v1 対象

Supply Demand Zones PRO

Session Overlay Pack

Trend Bias Analyzer

将来拡張対象

Breakout Detector

Volatility Compression Detector

Reversal Probability Engine

Session Momentum Tracker

MTF Consensus Engine

3.2 対象イベント

Adaptive Ranking Engine が評価対象とするのは、最低限以下。

signal event

overlay event

indicator event

ただし v1 で重みを最も強く持つのは signal event。
overlay / indicator は補助評価とする。

4. データモデル
4.1 PluginEvent

Reliability Lab で保存される plugin 発火イベント。

model PluginEvent {
  id           String   @id @default(uuid())
  pluginKey    String
  symbol       String
  timeframe    String
  eventType    String      // signal | overlay | indicator
  direction    String?     // bullish | bearish | neutral
  price        Float?
  confidence   Float?
  metadata     Json?
  emittedAt    DateTime
  createdAt    DateTime @default(now())
}
4.2 PluginEventResult

各 event の将来結果照合。

model PluginEventResult {
  id            String   @id @default(uuid())
  eventId        String
  candleOffset   Int
  priceChange    Float
  returnPct      Float
  mfe            Float
  mae            Float
  hitTpLike      Boolean?
  hitSlLike      Boolean?
  evaluatedAt    DateTime @default(now())
}
4.3 PluginConditionStats

条件別集計。

model PluginConditionStats {
  id               String   @id @default(uuid())
  pluginKey         String
  symbol            String?
  timeframe         String?
  conditionType     String   // session | atr_band | score_band | trend_bias | zone_context ...
  conditionValue    String
  sampleSize        Int
  winRate           Float
  avgReturn         Float
  avgMfe            Float
  avgMae            Float
  expectancy        Float
  updatedAt         DateTime @updatedAt
}
4.4 PluginReliability

plugin の総合信頼度。

model PluginReliability {
  id                 String   @id @default(uuid())
  pluginKey           String
  symbol              String?
  timeframe           String?
  sampleSize          Int
  winRate             Float
  expectancy          Float
  avgReturn           Float
  avgMfe              Float
  avgMae              Float
  reliabilityScore    Float
  stabilityScore      Float
  confidenceScore     Float
  state               String   // active | demoted | suppressed | stop_candidate | auto_stopped
  updatedAt           DateTime @updatedAt
}
4.5 PluginAdaptiveDecision

エンジンが下した現在の運用判断。

model PluginAdaptiveDecision {
  id                  String   @id @default(uuid())
  pluginKey            String
  symbol               String?
  timeframe            String?
  contextHash          String?
  globalScore          Float
  contextualScore      Float
  finalRankScore       Float
  rankPosition         Int
  action               String   // prioritize | normal | demote | suppress | stop_candidate | auto_stop
  reasonCodes          Json
  decidedAt            DateTime
}
5. 評価指標
5.1 基本指標

各 plugin に対して以下を算出する。

sampleSize

winRate

avgReturn

expectancy

avgMFE

avgMAE

medianReturn

stdevReturn

drawdownLikeLossStreak

neutralRate

invalidSignalRate

指標定義

winRate
評価 horizon における returnPct > 0 の比率

expectancy
平均期待値
expectancy = average(returnPct)

stabilityScore
標準偏差が小さいほど高評価

confidenceScore
サンプル数の十分性

5.2 Sample Size Factor

サンプル数不足の plugin を過大評価しないための係数。

sampleSizeFactor =
  sampleSize < 20  ? 0.35 :
  sampleSize < 50  ? 0.60 :
  sampleSize < 100 ? 0.80 :
                     1.00
5.3 Stability Factor

リターン分散が大きすぎる plugin は減点。

stabilityFactor =
  1 / (1 + normalizedStdDev)
5.4 Penalty 指標

以下は強い減点対象。

invalidSignalRate が高い

MAE が大きい

連続損失 streak が大きい

特定条件で極端に壊れる

neutral / useless output が多い

6. Reliability Score 計算式

v1 の総合 reliability score は以下。

reliabilityScore =
  (
    winRateNorm       * 0.30 +
    expectancyNorm    * 0.25 +
    avgReturnNorm     * 0.10 +
    stabilityNorm     * 0.15 +
    confidenceNorm    * 0.20
  )
  * sampleSizeFactor
  * penaltyFactor
6.1 各正規化値

winRateNorm : 0.0〜1.0

expectancyNorm : -1〜1 を 0〜1 に変換

avgReturnNorm : 同上

stabilityNorm : 0〜1

confidenceNorm : 0〜1

penaltyFactor : 0.2〜1.0

7. Contextual Score

現在のチャート条件に近い条件だけで算出する score。

対象条件例

session: Tokyo / London / NewYork / Overlap

scoreBand: HIGH / MID / LOW

trendBias: bullish / bearish / neutral

atrBand: low / mid / high

zoneContext: nearDemand / nearSupply / none

timeframe

symbol

7.1 Context Hash

現在条件をまとめて hash 化。

context = {
  session: "London",
  trendBias: "bullish",
  atrBand: "mid",
  scoreBand: "HIGH",
  zoneContext: "nearDemand",
  timeframe: "H1",
  symbol: "EURUSD"
}
7.2 Contextual Score 計算

条件一致の PluginConditionStats を重み付き合算。

contextualScore =
  sessionScore     * 0.20 +
  trendBiasScore   * 0.20 +
  atrBandScore     * 0.15 +
  scoreBandScore   * 0.15 +
  zoneContextScore * 0.15 +
  symbolTfScore    * 0.15
8. 最終順位スコア

最終順位には Global と Contextual を両方使う。

finalRankScore =
  globalScore     * 0.45 +
  contextualScore * 0.55

理由：

全体成績だけだと局所条件に弱い

条件だけだとサンプル不足に弱い

そのため Contextualをやや重め にする。

9. Adaptive Decision ルール
9.1 state 判定
Active
reliabilityScore >= 0.70
&& sampleSize >= 50
&& penaltyFactor >= 0.8
Demoted
0.55 <= reliabilityScore < 0.70
Suppressed
0.40 <= reliabilityScore < 0.55
or invalidSignalRate > threshold
Stop Candidate
reliabilityScore < 0.40
&& sampleSize >= 50
Auto Stopped
reliabilityScore < 0.30
&& sampleSize >= 100
&& lossStreakPenalty severe
9.2 行動内容
prioritize

UI 上位表示

signal の強調表示

analysis summary で優先採用

normal

通常表示

demote

UI 下位表示

summary の重みを減らす

suppress

初期表示オフ

runtime 実行は継続するが可視化を抑える

stop_candidate

管理画面で警告

自動停止候補として表示

auto_stop

runtime 対象から除外

ただし admin が復帰可能

10. 自動停止の安全策

自動停止は危険なので安全装置を入れる。

10.1 hard stop 条件

以下すべて満たす時のみ。

sampleSize >= 100

reliabilityScore < 0.30

直近50イベントでも改善傾向なし

特定条件だけでなく global に悪い

manual lock されていない

10.2 cooldown 復帰

auto_stop された plugin も完全削除しない。
一定期間後に試験復帰可能にする。

10.3 paper mode

復帰後しばらくは paper mode で評価のみ行い、表示しない。

11. Ranking 更新周期
リアルタイム更新

軽量更新

new event capture 時

new event result evaluation 時

バッチ更新

重い再計算

hourly aggregate job

daily full recompute

推奨

5分ごと: 軽量 score 更新

1時間ごと: 条件別統計更新

1日1回: フル再計算・state 判定

12. API 設計
12.1 Reliability 一覧

GET /api/v1/plugins/reliability

レスポンス例

[
  {
    "pluginKey": "trend-bias-analyzer",
    "sampleSize": 312,
    "winRate": 0.61,
    "expectancy": 0.42,
    "reliabilityScore": 0.74,
    "state": "active"
  }
]
12.2 条件別成績

GET /api/v1/plugins/reliability/conditions?pluginKey=trend-bias-analyzer

12.3 Adaptive Decision

GET /api/v1/plugins/adaptive-ranking

現在順位と action を返す。

12.4 自動停止候補

GET /api/v1/plugins/adaptive-ranking/stop-candidates

12.5 管理操作

PATCH /api/v1/plugins/:pluginKey/adaptive-state

手動 override 用。

13. UI 設計
13.1 Chart 上の表示

各 plugin に以下を表示可能にする。

Reliability Score

rank badge

state badge

sample size

例

Trend Bias Analyzer
Rank #1
Reliability 74
Sample 312
State ACTIVE
13.2 Plugin Reliability Dashboard

ページ例

/analysis/plugins

表示ブロック

plugin ranking

reliability trend

condition heatmap

stop candidates

recently improved plugins

recently degraded plugins

13.3 Condition Matrix

plugin × condition のマトリクス。

例

Plugin	Tokyo	London	NY	High ATR	Near Demand
Trend Bias	42	71	68	55	77
Supply Demand	58	63	60	49	82
14. Runtime への反映方法

Adaptive Ranking Engine の結果は runtime に反映する。

14.1 Resolver 反映

suppressed / auto_stop state の plugin は resolver 段階で制御可能。

14.2 Coordinator 反映

priority 順に plugin 実行・集約。

14.3 Renderer 反映

高 rank plugin の signal を上位表示。
低 rank plugin は薄色・折りたたみ・初期非表示。

15. v1 / v2 機能境界
v1

reliability score 算出

contextual score 算出

ranking API

suppress / demote / stop_candidate

manual auto_stop

dashboard 表示

v2

完全自動停止

self-recovery

plugin ensemble weight learning

market regime detector 連動

adaptive confidence recalibration

16. 実装順序
Phase A

DB テーブル追加

PluginReliability

PluginAdaptiveDecision

Phase B

集計サービス実装

ReliabilityScoringService

AdaptiveRankingService

Phase C

API 実装

reliability controller

ranking controller

Phase D

runtime 反映

resolver / coordinator / renderer

Phase E

dashboard 実装

17. Claude に実装させる際の厳守事項

既存の Plugin Runtime v1 を壊さない

先に event capture / evaluation が存在する前提で進める

勝手に API 名を変更しない

PRO以上 など曖昧表現禁止

すべて /api/v1 配下

Zod 正本、DTO 派生ルール厳守

suppress と auto_stop を混同しない

sample size が少ない plugin を過大評価しない

18. 最終的な価値

この engine が完成すると FXDE は

「plugin を表示するツール」 から
「plugin の品質を継続学習し、今信用できるものを自動で前に出す分析OS」
に変わる。

つまり、

plugin を作る

実行する

結果を観測する

条件別に精度を測る

順位をつける

低品質を抑制する

高品質を優先する

という 閉ループ が完成する。