# FXDE 仕様準拠監査レポート（2026-03-12 / round4）

## 1. 監査対象

今回の監査対象:

- 最新コード: fxde_project_src_only.tar.gz
- 修正履歴:
  - Claudeでの修正履歴_260312_05.txt
  - Claudeでの修正履歴_260312_06.txt
- 既存監査:
  - FXDE_AUDIT_REPORT_20260312_round3.md
- 正本仕様:
  SPEC_v51_part1.md ～ SPEC_v51_part11.md
- UI参照:
  FXDE_v51_wireframe_integrated.html

---

# 2. 今回の作業内容（Claude実施）

Predictions モジュール契約回収。

実施タスク:

Task B
STUB_PREDICTION_RESULT 正本化

Task C
PredictionScenario / PredictionLatestResponse / TfWeight
shared types 昇格

Task D
processor → service 逆流依存解消

Task A
PATCH /predictions/jobs/:id/tf-weights
backend / frontend 実装

さらに:

- Json → unknown → 型キャスト修正
- Prisma updatedAt 不在問題修正

---

# 3. コンパイル確認

以下すべて成功

packages/types
apps/api
apps/web


pnpm --filter @fxde/types build
pnpm tsc --noEmit


TypeScript error: 0

---

# 4. 仕様整合評価

|領域|評価|
|---|---|
Predictions backend|ほぼ仕様準拠|
Queue + worker|仕様通り|
Frontend predictions|接続済|
Chart|存在確認済|

現在の完成度:

**Prediction: 95%**

---

# 5. 修正で改善された点

## STUB 正本化

旧


0.42 / 0.33 / 0.25


新


0.63 / 0.22 / 0.15


SPEC_v51_part8 §9.3 と整合。

---

## shared types 統一

追加


PredictionScenario
PredictionLatestResponse
TfWeight
DEFAULT_TF_WEIGHTS
TfWeightsUpdateResponse
UpdateTfWeightsInput


---

## PATCH tf-weights API

実装完了


PATCH /api/v1/predictions/jobs/:id/tf-weights


backend:

- schema
- dto
- service
- controller

frontend:

- api.ts
- usePredictionJob
- Prediction.tsx

---

# 6. 残件

優先度順

P1
Redis env 契約統一
REDIS_URL vs HOST/PORT

P1
PredictionJob.updatedAt
将来的に Prisma schema へ追加検討

P2
Prediction worker 実処理
現在 stub

P2
Chart overlay prediction

---

# 7. 総合評価

構造評価:

良好

Prediction subsystem:

**完成度: 約95%**

重大設計問題:

なし

---

# 8. 次フェーズ

次の対象

Prediction 拡張

または

Chart + AI summary