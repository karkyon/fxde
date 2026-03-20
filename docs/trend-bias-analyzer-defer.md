# trend-bias-analyzer — 自動評価 defer 記録

<!-- 作成: 2026-03-20 / 参照: FXDE_Adaptive_Plugin_Ranking_Engine_完全設計書 §3, §17 -->

## ステータス

**DEFERRED / data accumulation wait**

trend-bias-analyzer の信頼性評価（Reliability Score / AdaptiveRanking）は、
sampleSize が統計的信頼水準に達するまで **運用判断として defer** する。

---

## defer の理由

FXDE の PluginReliability は信頼できる統計を保証するため、
以下の最小 sampleSize 基準を設けている（設計書 §3 参照）。

| sampleSize | 信頼水準 |
|------|------|
| < 100 | 🔴 信頼不可 — 参考程度 |
| 100〜499 | 🟡 低信頼 — 傾向把握のみ |
| **≥ 500** | **✅ 再評価実施ライン** |

現在の trend-bias-analyzer のサンプルは統計的信頼水準（≥ 500）に未達。
コード変更は不要。データ蓄積を待つ運用判断。

---

## 再評価条件（次のアクションが必要になる時点）

以下のいずれかが成立したとき、この defer を解除して正式評価を実施する。

1. **`sampleSize >= 500`** に達した時点で、AdaptiveRankingService を手動で再実行する
2. winRate / expectancy が明らかな問題（< 0.40 / < 0.0）を示している場合は
   sampleSize 条件を待たず `stop_candidate` に手動で変更してよい

---

## 現在の実装状態

```
apps/api/src/plugins-runtime/executor/trend-bias-analyzer.adapter.ts
```

- candles.length < 20 の場合は `{ overlays: [], signals: [], indicators: [] }` を返してスキップ
- candles.length >= 20 であれば MA5/MA20 とバイアス判定を実行して signal を生成する
- 自動停止ロジックは未実装（v2 scope / 設計書 §15 参照）

**重要: このアダプタのロジックをコード変更で修正してはならない。**
信頼性評価の問題はデータ不足であり、アルゴリズムの問題ではない。

---

## Reliability スコアの現状（記録基準日: 2026-03-20）

| 項目 | 値 |
|------|------|
| sampleSize | < 500（defer 継続） |
| state | `stop_candidate`（データ蓄積中） |
| 再評価予定 | sampleSize >= 500 到達後 |

> **注**: PluginReliability の `state` が `stop_candidate` であっても、
> 自動停止（auto_stop）は v2 scope であるため現時点では plugin-runtime の実行から除外されない。
> 除外が必要な場合は `PluginAdaptiveDecision.action = 'suppress'` を手動で設定すること。

---

## 関連ファイル

| ファイル | 役割 |
|---|---|
| `apps/api/src/plugins-runtime/executor/trend-bias-analyzer.adapter.ts` | プラグイン実行アダプタ |
| `apps/api/src/modules/plugins-ranking/service/reliability-scoring.service.ts` | sampleSize 集計ロジック |
| `apps/api/src/modules/plugins-ranking/service/adaptive-ranking.service.ts` | 自動ランキング判定 |
| `apps/api/src/modules/plugins-ranking/jobs/reliability-recompute.job.ts` | Reliability 再計算 BullMQ ジョブ |
| `FXDE_Adaptive_Plugin_Ranking_Engine_完全設計書.md` | 設計正本（§3, §15, §17） |

---

## 次会話への引き継ぎ事項

- この defer は **コード修正ではなく運用判断** として記録されている
- `sampleSize >= 500` 到達まで、自動テスト・ランキング評価ともに defer を維持する
- Playwright E2E のテスト対象として trend-bias-analyzer の signal 表示を含める場合は
  `docs/e2e-design.md` を参照すること（タスクC で作成）