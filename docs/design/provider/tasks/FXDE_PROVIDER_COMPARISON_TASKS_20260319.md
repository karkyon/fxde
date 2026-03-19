■ PHASE A: Market Data Provider 層（最優先）
A-1 Provider 抽象インターフェース

対象:

apps/api/src/modules/market-data/

やること:

[A-1-1] provider.interface.ts 作成

fetchRange(symbol, timeframe, from, to)

fetchLatest(symbol, timeframe)

[A-1-2] Canonical Candle 型定義

timestamp, open, high, low, close, volume

provider, latencyMs, isComplete

A-2 Dukascopy Provider 実装

対象:

dukascopy.provider.ts

やること:

[A-2-1] APIレスポンス取得

[A-2-2] toCanonical() 実装

[A-2-3] incomplete bar 除外

[A-2-4] provider = 'dukascopy' 付与

[A-2-5] latency 測定

A-3 Provider Orchestrator

対象:

market-data.service.ts

やること:

[A-3-1] provider選択ロジック

[A-3-2] fallback provider 設計（将来用 stub）

[A-3-3] canonical 返却

A-4 DB保存（任意だが推奨）

[A-4-1] candles テーブル（任意）

[A-4-2] snapshot と紐付け

■ PHASE B: Auto Chart Pattern Engine
B-1 Pattern Engine Core

対象:

pattern-engine.service.ts

やること:

[B-1-1] peaks / troughs 検出

[B-1-2] pattern 判定（最低限1種でOK）

[B-1-3] direction（BUY/SELL）確定

B-2 Plugin Adapter（すでに途中まであるはず）

[B-2-1] adapter → engine 呼び出し

[B-2-2] inlineロジック完全排除（既にやったやつの確認）

B-3 Pattern → Snapshot 連携

[B-3-1] snapshot 保存時に pattern 情報追加

[B-3-2] pattern metadata 保存

■ PHASE C: Condition Context Engine
C-1 Context Builder

対象:

context-builder.service.ts

やること:

[C-1-1] volatility context

[C-1-2] session context（London/NY）

[C-1-3] trend context

[C-1-4] event context（stubでOK）

C-2 Snapshot への組み込み

[C-2-1] metadata.context に追加

[C-2-2] entryContextとは別管理

C-3 Context Storage

[C-3-1] snapshot.metadata に保存

[C-3-2] JSON構造統一

■ PHASE D: Reliability Lab / Evaluation
D-1 結果追跡

[D-1-1] snapshot → outcome tracking

[D-1-2] 勝敗判定

D-2 Reliability 計算

[D-2-1] winRate

[D-2-2] avgRR

[D-2-3] context別 breakdown

D-3 API

[D-3-1] /plugins/reliability

[D-3-2] /plugins/reliability/context

■ PHASE E: Adaptive Plugin Ranking Engine
E-1 Data Model

[E-1-1] PluginReliability

[E-1-2] PluginAdaptiveDecision

E-2 Ranking Service

[E-2-1] スコア算出

[E-2-2] decay（新しいデータ重視）

[E-2-3] context別重み

E-3 Runtime 反映

[E-3-1] plugin execution weight

[E-3-2] disable low performer

■ PHASE F: UI / 可視化
F-1 Reliability Lab UI

[F-1-1] plugin別成績

[F-1-2] context別分解

F-2 Chart 連携

[F-2-1] snapshot overlay

[F-2-2] pattern表示

F-3 Plugin Ranking UI

[F-3-1] ランキング表示

[F-3-2] ON/OFF切替

■ PHASE G: 最終統合

[G-1] Provider → Pattern → Snapshot → Context → Reliability → Ranking の一貫動作

[G-2] API統合

[G-3] E2Eテスト