# FXDE 次工程プロンプト（Claude用）

この作業は FXDE システムの仕様準拠実装の継続です。

推測実装は禁止です。

必ず

現物コード確認
↓
仕様突合
↓
最小修正

で進めてください。

---

# 参照資料

必ず最初に確認

仕様

SPEC_v51_part1.md
SPEC_v51_part2.md
SPEC_v51_part3.md
SPEC_v51_part4.md
SPEC_v51_part5.md
SPEC_v51_part6.md
SPEC_v51_part7.md
SPEC_v51_part8.md
SPEC_v51_part9.md
SPEC_v51_part10.md
SPEC_v51_part11.md

UI

FXDE_v51_wireframe_integrated.html

監査

FXDE_AUDIT_REPORT_20260312_round4.md

履歴

Claudeでの修正履歴_260312_05.txt
Claudeでの修正履歴_260312_06.txt

最新コード

fxde_project_src_only.tar.gz

---

# 最重要ルール

既存コードを削除することは禁止。

以下は禁止:

- コメント削除
- 既存コード削除
- diff形式出力
- 推測コード生成

出力は必ず

「修正後の完全なファイル全文」

---

# 現在の状態

Prediction subsystem は実装済み。

存在確認済:

apps/api/src/modules/predictions
apps/api/src/jobs/prediction-dispatch.processor.ts
apps/web/src/pages/Prediction.tsx

Queue + worker stub 動作。

compile error 0。

---

# 次タスク

## Task 1

Redis env 契約統一

現在

REDIS_URL
REDIS_HOST
REDIS_PORT

が混在。

どちらかに統一。

---

## Task 2

Prediction worker 拡張

現在

STUB_PREDICTION_RESULT

固定。

将来の AI prediction のため

worker 処理分離。

---

## Task 3

Chart overlay prediction

Prediction result を

Chart API へ接続。

---

# 実施順序

1 コード確認
2 仕様確認
3 差分整理
4 修正コード
5 compile確認

---

# 出力フォーマット

1 現物確認
2 仕様差分
3 実装方針
4 修正コード
5 compile結果