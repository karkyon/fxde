# FXDE Plugin Reliability Lab
## PGレベル画面仕様書（既存 Chart ページ連携版）

## 0. 文書目的

本資料は、**FXDE本体の既存 Chart ページ（PG-07 / `/chart`）と整合する形で**、
Plugin Reliability Lab を画面仕様レベルまで具体化するための PG レベル画面仕様書である。

目的は次の 3 点。

1. 既存 Chart ページから自然に遷移・連携できる Research 画面群を定義する
2. 各画面のレイアウト、コンポーネント、操作フロー、データ要件を固定する
3. Claude / 実装担当がそのまま UI 実装へ入れる粒度まで詳細化する

---

## 1. 設計前提

### 1.1 位置づけ

Plugin Reliability Lab は、既存の Plugin Runtime が出力する signal / overlay / indicator を対象として、
過去データ上での信頼性・条件別優位性・複合条件を研究するための機能群である。

本機能は以下の既存領域に接続する。

- **PG-07 Chart (`/chart`)**
- Plugin Runtime API
- Plugin Signal Ledger
- Plugin Research / Reliability API

### 1.2 基本思想

- Chart ページは **現時点の分析・判断の場**
- Reliability Lab は **過去検証・統計研究の場**
- 両者は分離しつつ、**相互遷移と条件引継ぎ** を強く持つ

### 1.3 ユーザーが実現したいこと

- 今チャートで見ている plugin の信頼性をすぐ知りたい
- この plugin がどの市場・時間帯・条件で強いかを知りたい
- 他 plugin との併発で優位性が増すか知りたい
- 個別の成功・失敗イベントをチャートへ戻って確認したい
- 研究結果を次の plugin 改良へつなげたい

---

## 2. 画面構成全体

Reliability Lab は以下の PG 群で構成する。

- **PG-07 Chart**（既存 / 連携強化）
- **PG-R1 Plugin Reliability Dashboard**
- **PG-R2 Plugin Detail Research**
- **PG-R3 Combination Lab**
- **PG-R4 Event Explorer**
- **PG-R5 Research Job Center**

補助的に、PG-07 内に **Research Entry UI** を追加する。

---

## 3. サイトルーティング / URL 設計

### 3.1 既存
- `/chart`

### 3.2 新規
- `/research/plugins`
- `/research/plugins/:pluginKey`
- `/research/combinations`
- `/research/events`
- `/research/jobs`

### 3.3 クエリ引継ぎ例
- `/research/plugins/supply-demand-zones-pro?symbol=USDJPY&timeframe=H1&session=LONDON&rule=tp_sl_first_hit`
- `/research/events?pluginKey=supply-demand-zones-pro&symbol=USDJPY&timeframe=H1&outcomeLabel=FAIL`
- `/chart?symbol=USDJPY&timeframe=H1&focusEventId=evt_xxx`

### 3.4 URL設計方針
- Chart → Research 遷移時は **symbol / timeframe / pluginKey / session / rule** を引き継ぐ
- Research → Chart 遷移時は **focusEventId / detectedAt / pluginKey** を引き継ぐ
- 画面再読込で状態復元できるよう、主要フィルタはクエリへ反映する

---

## 4. PG-07 Chart（既存ページへの追加仕様）

## 4.1 画面目的

リアルタイムまたは現時点のチャート分析ページとして、
plugin runtime の出力を見ながら、該当 plugin の研究画面へ即遷移できるようにする。

## 4.2 追加するUIブロック

### A. Plugin Runtime Summary Strip
配置:
- MainChart 上部または右上サイド情報領域

表示内容:
- 現在有効な plugin 数
- 発火中 signal 数
- overlay 数
- plugin execution status（成功 / 失敗 / timeout）
- 「Researchで検証」ボタン

操作:
- ボタン押下で PG-R1 または PG-R2 へ遷移
- 直前の chart context を引継ぐ

### B. Plugin Signal Cards
配置:
- 既存の signals / prediction / notes 周辺の補助カード領域

表示内容:
- plugin 名
- signal ラベル
- direction
- confidence
- detected time
- 「このsignalの過去成績」リンク
- 「失敗事例を見る」リンク

操作:
- 「過去成績」→ PG-R2 へ遷移
- 「失敗事例を見る」→ PG-R4 へ遷移

### C. Chart Context → Research Quick Actions
配置:
- Chart page 右上アクション群

ボタン例:
- この plugin を研究
- この通貨ペアで比較
- この時間足で比較
- London 時間だけで検証
- 併発 plugin を調べる

---

## 4.3 PG-07 から渡す state

必須:
- `symbol`
- `timeframe`
- `pluginKey`
- `detectedAt`（signal選択時）

任意:
- `session`
- `direction`
- `focusEventId`
- `ruleKey`
- `concurrentPluginKeys[]`

---

## 4.4 PG-07 での主な利用フロー

### フロー1: 今見ている plugin の信頼性を見る
1. Chart で plugin overlay / signal を確認
2. Signal Card の「このpluginの過去成績」を押す
3. PG-R2 Plugin Detail Research へ遷移
4. symbol/timeframe を引き継いだ状態で詳細比較を見る

### フロー2: 今の signal に似た失敗事例を見る
1. Chart で signal 選択
2. 「失敗事例を見る」を押す
3. PG-R4 Event Explorer へ遷移
4. 同 plugin / 同 symbol / 同 timeframe / FAIL 条件で絞り込み済み表示

### フロー3: 併発条件を研究する
1. Chart 上で複数 plugin が同時発火
2. 「併発 plugin を調べる」を押す
3. PG-R3 Combination Lab へ遷移
4. 単独 vs 併発条件比較を見る

---

## 5. PG-R1 Plugin Reliability Dashboard

## 5.1 目的

plugin 全体の信頼性サマリを一覧比較し、
どの plugin に研究価値・運用価値があるかを俯瞰する。

## 5.2 URL
`/research/plugins`

## 5.3 主対象ユーザー
- 運用者
- plugin 開発者
- 検証担当

## 5.4 レイアウト

### 上段: Header / Global Filters
- ページタイトル
- date range
- symbols
- timeframes
- evaluation rule
- session
- trend regime
- volatility regime
- sample warning 表示

### 中段左: KPI Summary Cards
- Tracked Plugins
- Total Signal Events
- Total Evaluated Events
- Selected Rule
- Best Overall Plugin
- Worst Decay Warning

### 中段右: Quick Insight Panel
- 今最も強い plugin
- 最近成績が低下している plugin
- sample 不足 plugin
- 再評価が必要な plugin

### 下段中央: Plugin Comparison Table
列:
- Plugin
- Version
- Samples
- Win Rate
- Avg Return
- Avg R
- Profit Factor
- Avg MFE
- Avg MAE
- Best Session
- Best Symbol
- Status
- Actions

### 下段右: Heatmap / Matrix Tabs
タブ:
- Session Heatmap
- Symbol × TF Matrix
- Regime Matrix

---

## 5.5 主要操作

### 操作1: plugin をクリック
→ PG-R2 に遷移

### 操作2: 行の「Combinations」
→ PG-R3 に遷移

### 操作3: 行の「Events」
→ PG-R4 に遷移

### 操作4: フィルタ変更
→ テーブル / KPI / Heatmap 同時更新

---

## 5.6 必要データ

- plugin summary list
- by-session aggregate
- by-symbol aggregate
- by-timeframe aggregate
- filter metadata
- sample warning metadata

---

## 6. PG-R2 Plugin Detail Research

## 6.1 目的

特定 plugin を深掘りし、
その plugin がどの条件で強く、どの条件で弱いかを研究する。

## 6.2 URL
`/research/plugins/:pluginKey`

## 6.3 画面構成

### A. Plugin Header
表示:
- plugin 名
- version
- capabilities
- total samples
- last evaluated
- linked chart button
- run job button

### B. Scope Filters
- symbol
- timeframe
- date range
- rule
- session
- trend state
- volatility
- higher TF bias
- concurrent plugin

### C. Performance Cards
- Win Rate
- Expectancy
- Profit Factor
- Avg MFE
- Avg MAE
- Max Losing Streak
- Sample Count
- Confidence Score

### D. Breakdown Tabs
タブ:
1. Session
2. Symbol
3. Timeframe
4. Trend / Volatility
5. Concurrent Plugins
6. Version Compare（将来拡張）

### E. Distribution Panel
- outcome breakdown pie / bar
- return distribution
- MFE vs MAE scatter

### F. Insight Notes Panel
- 強い条件メモ
- 弱い条件メモ
- false positive 仮説
- 次の改良案

### G. Linked Event Snippets
- recent success cases
- recent failure cases
- open in Event Explorer
- open in Chart

---

## 6.4 主な操作フロー

### フロー1: symbol/timeframe 固定で研究
1. Chart から来た symbol/timeframe が初期セット済み
2. rule を選ぶ
3. session と trend でさらに絞る
4. Breakdown を確認
5. 強い条件をメモ化

### フロー2: 失敗要因調査
1. Concurrent Plugins タブまたは Trend / Volatility タブ確認
2. 弱い条件を発見
3. failure snippets を開く
4. Event Explorer へ移動
5. Chart へ戻って現物確認

---

## 6.5 必要データ

- plugin detail summary
- breakdown aggregates by each axis
- linked event summaries
- current warnings
- metadata for available filters

---

## 7. PG-R3 Combination Lab

## 7.1 目的

plugin 単独ではなく、
他 plugin や市場条件との**複合条件**での優位性を比較する。

## 7.2 URL
`/research/combinations`

## 7.3 主機能

### A. Base Plugin Selector
- 対象 plugin 選択

### B. Condition Builder
追加可能条件:
- session
- symbol
- timeframe
- trend state
- volatility regime
- higher TF bias
- concurrent plugin exists
- concurrent plugin exact match
- direction
- weekday
- hour bucket

### C. Scenario List
例:
- Zone only
- Zone + London
- Zone + Uptrend
- Zone + London + Uptrend
- Zone + RSI Divergence
- Zone + RSI Divergence + London

### D. Scenario Comparison Table
列:
- Scenario Name
- Samples
- Win Rate
- Avg Return
- Expectancy
- PF
- Avg MFE
- Avg MAE
- Warning

### E. Scenario Delta View
- 基準シナリオ比での差分
- +5.2pt win rate
- +0.14R expectancy
- sample -82%

---

## 7.4 操作フロー

1. Base plugin 選択
2. 条件を順に追加
3. シナリオを保存
4. 3〜6個程度を横比較
5. 優位性増加と sample 減少のトレードオフを見る
6. Event Explorer / Chart へ遷移して実例確認

---

## 7.5 必要データ

- combination summary list
- condition metadata
- scenario compare result
- sample warning

---

## 8. PG-R4 Event Explorer

## 8.1 目的

シグナルイベント単位で、成功・失敗・期限切れ・不明確の事例を精査する。
統計だけでなく、**個別事象の質的確認** を行う場。

## 8.2 URL
`/research/events`

## 8.3 レイアウト

### 上段: Filters
- plugin
- symbol
- timeframe
- outcomeLabel
- rule
- session
- direction
- date range
- concurrent plugin

### 中段: Event Table
列:
- Detected At
- Symbol
- TF
- Plugin
- Direction
- Trigger Price
- Outcome
- Return
- MFE
- MAE
- Session
- Trend State
- Actions

### 右ペイン or Drawer: Event Detail
表示内容:
- eventId
- plugin version
- context snapshot
- concurrent plugins
- evaluation rule
- firstHit / barsObserved
- notes

アクション:
- Open in Chart
- Open related plugin research
- Compare similar events

---

## 8.4 操作フロー

### フロー1: 失敗事例だけを見る
1. outcomeLabel=FAIL
2. pluginKey / symbol / timeframe を絞る
3. トレンド状態や concurrent plugin で並び替え
4. 代表的失敗事例を抽出
5. Open in Chart で現物確認

### フロー2: 成功条件を掘る
1. outcomeLabel=SUCCESS
2. Session=London
3. concurrent plugin=RSI Divergence
4. 成功事例群の共通点を見る

---

## 8.5 Chart 連携

Open in Chart 時の挙動:
- `/chart?symbol=...&timeframe=...&focusEventId=...&pluginKey=...`
- Chart 側で該当 event 時刻周辺へフォーカス
- 可能なら vertical marker / highlight box を表示

---

## 9. PG-R5 Research Job Center

## 9.1 目的

大量の再評価・再集計ジョブを管理する。

## 9.2 URL
`/research/jobs`

## 9.3 画面構成

### A. Job Create Panel
項目:
- plugin(s)
- symbols
- timeframes
- date range
- rule(s)
- session filters
- overwrite / append mode

### B. Job Queue Table
列:
- Job ID
- Scope Summary
- Created At
- Status
- Progress
- Result Summary
- Actions

### C. Job Result Drawer
- processed events
- evaluation count
- aggregate updated
- warnings
- errors

---

## 9.4 v1 方針

- まずは簡易 job center でよい
- ジョブ状態は `QUEUED / RUNNING / SUCCEEDED / FAILED / PARTIAL_SUCCESS`
- 失敗理由を UI 上で明示

---

## 10. 共通UI部品仕様

## 10.1 Global Research Filter Bar
共通配置:
- R1 / R2 / R3 / R4 上部

項目:
- date range
- symbol multiselect
- timeframe multiselect
- rule selector
- session selector
- trend selector
- volatility selector

仕様:
- 変更で URL クエリ更新
- debounce + apply button のどちらでも可
- リセットボタン必須

---

## 10.2 Sample Warning Badge
表示条件例:
- sample < 100
- sample < 30 は強警告

文言例:
- `Sample Low`
- `Very Low Sample`
- `Out-of-sample needed`

---

## 10.3 Research Action Buttons
共通ボタン:
- Open in Chart
- View Events
- Compare Combinations
- Run Re-evaluation
- Copy Share Link

---

## 11. 画面間遷移マップ

### Chart 起点
- PG-07 → PG-R2（plugin詳細）
- PG-07 → PG-R4（event一覧）
- PG-07 → PG-R3（併発比較）

### Dashboard 起点
- PG-R1 → PG-R2
- PG-R1 → PG-R3
- PG-R1 → PG-R4

### Plugin Detail 起点
- PG-R2 → PG-R4
- PG-R2 → PG-R3
- PG-R2 → PG-07

### Event Explorer 起点
- PG-R4 → PG-07
- PG-R4 → PG-R2

---

## 12. APIマッピング（画面別）

## 12.1 PG-R1
- `GET /api/v1/plugin-research/summary`
- `GET /api/v1/plugin-research/by-session`
- `GET /api/v1/plugin-research/by-symbol`
- `GET /api/v1/plugin-research/by-timeframe`

## 12.2 PG-R2
- `GET /api/v1/plugin-research/summary?pluginKey=...`
- `GET /api/v1/plugin-research/by-session?pluginKey=...`
- `GET /api/v1/plugin-research/by-symbol?pluginKey=...`
- `GET /api/v1/plugin-research/by-timeframe?pluginKey=...`
- `GET /api/v1/plugin-research/events?pluginKey=...`

## 12.3 PG-R3
- `GET /api/v1/plugin-research/combinations`
- `POST /api/v1/plugin-research/combinations/compare`（必要なら追加）

## 12.4 PG-R4
- `GET /api/v1/plugin-research/events`
- `GET /api/v1/plugin-research/events/:eventId`（必要なら追加）

## 12.5 PG-R5
- `POST /api/v1/plugin-research/jobs`
- `GET /api/v1/plugin-research/jobs`
- `GET /api/v1/plugin-research/jobs/:id`

---

## 13. 状態管理方針

### 13.1 URLで保持するもの
- pluginKey
- symbol
- timeframe
- session
- ruleKey
- outcomeLabel
- trendState
- dateRange

### 13.2 クライアント state で持つもの
- panel open / close
- selected rows
- temporary scenario builder state
- unsaved research notes

### 13.3 共有リンク
- 現在の研究条件をそのまま共有可能にする
- query string を正とする

---

## 14. UX要件

### 14.1 重要UX
- Chart からワンクリックで研究画面へ行ける
- Research からワンクリックで Chart の具体例へ戻れる
- 「統計」だけで終わらず「現物確認」に戻せる
- 複合条件比較が直感的にできる
- sample 不足を必ず警告する

### 14.2 失敗しやすいUXを避ける
- 画面ごとにフィルタ体系がバラバラ
- 研究条件がURLに残らない
- Chart へ戻った時に event にフォーカスできない
- 複合条件がブラックボックス化する

---

## 15. 実装優先順位

### Phase 1
- PG-07 への Research Entry UI 追加
- PG-R1 Dashboard
- PG-R2 Plugin Detail
- PG-R4 Event Explorer

### Phase 2
- PG-R3 Combination Lab
- Chart focusEventId 対応
- shareable URLs

### Phase 3
- PG-R5 Job Center
- advanced compare
- saved views / notes

---

## 16. 受け入れ基準

### PG-07
- plugin signal から Research へ遷移できる
- symbol/timeframe/pluginKey が引き継がれる

### PG-R1
- plugin一覧比較ができる
- filter変更で一覧・heatmapが更新される

### PG-R2
- 単一pluginの条件別研究ができる
- event一覧・chart遷移ができる

### PG-R3
- 単独/複合条件を比較できる
- sample warning が出る

### PG-R4
- event単位で成功/失敗を掘れる
- Chartへの戻り導線がある

### PG-R5
- 再評価ジョブを起票・確認できる

---

## 17. 実装メモ（Claude向け）

- 既存 PG-07 Chart のレイアウト責務を壊さず、右ペインまたは上部 summary strip として Research Entry UI を追加する
- Research 系ページは Tailwind + 既存 design token / card style に合わせる
- フィルタは URL クエリ同期必須
- Event Explorer から Chart 遷移時の `focusEventId` 対応を先に仕込む
- まずは HTML/SVG/既存コンポーネント延長でよく、過剰な可視化ライブラリ導入は不要
- sample warning と low-confidence 表示は MVP から必須

---

## 18. 一言でいうこの仕様の核

この画面群は、
**「チャートで気づいたパターンを、その場で過去統計へ飛び、統計からまた具体チャート事例へ戻って研究を深める」**
ための往復導線をつくる仕様である。

