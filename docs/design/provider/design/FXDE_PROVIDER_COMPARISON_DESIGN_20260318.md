# Provider 比較設計メモ（FXDE 本質設計）

## 0. 結論

FXDE の本質は「今どの API を使うか」ではない。  
本質は **provider 差異を吸収して、研究・検証・表示を分離すること** にある。

したがって設計判断は
- 単純な API の使いやすさ
ではなく
- 研究データとしての一貫性
- 差替容易性
- provider provenance
を軸に行うべき。

---

## 1. Provider ごとの役割整理

### OANDA
強み:
- 現行実装がすでにある
- 接続モデルが分かっている
- 既存コードへの影響が少ない

弱み:
- FXDE 本来目的の「高精度バックテスト主系」としては最適とは言い切れない
- 既存構造が OANDA 前提に寄っている

役割:
- **互換 provider**
- 後方互換の維持
- 将来の副系 provider

---

### Dukascopy
強み:
- 履歴研究に向く
- D1 / W1 / H4 研究の主系候補
- パターン・インジケータ信頼性研究と相性がよい

弱み:
- 実装時のデータ正規化難度が高い
- API 的な扱いやすさは OANDA 的発想で考えないほうがよい

役割:
- **研究主系 provider**
- 初期の FXDE 目的に最も合う候補

---

### Twelve Data（将来）
強み:
- API 指向で扱いやすい
- 最新付近の観測に向く
- 準リアルタイム用途に向く

弱み:
- 無料枠が厳しい
- 研究主系として固定するとデータ運用が難しくなる可能性

役割:
- **将来の最新値・監視補助 provider**
- リアルタイム寄りの補助

---

## 2. FXDE における正しい分離

### 2.1 研究用
- 主系: Dukascopy
- 対象: D1 / W1 / H4
- 用途: reliability / backtest / pattern study

### 2.2 互換用
- 主系: OANDA（当面）
- 用途: 既存コード互換 / fallback / transition

### 2.3 将来の最新監視用
- Twelve 等
- 用途: latest / alert / monitor

---

## 3. なぜ ProviderAdapter が必要か

外部 provider を直接使うと:
- 時刻
- volume
- timeframe
- complete/incomplete
- symbol naming
- health
- backfill strategy

が全部違う。

この差をアプリ全体へ漏らすと破綻する。  
だから

```text
Provider API
   ↓
Adapter
   ↓
Canonical Model
   ↓
DB / Internal API
   ↓
Chart / Strategy / Research
```

で固定すべき。

---

## 4. 比較表

| 項目 | OANDA | Dukascopy | Twelve Data |
|---|---|---|---|
| 現行適合性 | 高い | 低い | 低い |
| 研究適性 | 中 | 高 | 中 |
| 最新値用途 | 中 | 低〜中 | 高 |
| 実装容易性 | 高 | 中〜低 | 高 |
| 差替必要性 | 高い | 主系候補 | 将来補助候補 |

---

## 5. 設計上の正しい方針

### 今やるべき
- OANDA直依存を外す
- Dukascopy を主系候補として差し込めるようにする
- 研究系は provider 分離前提で作る

### 今やってはいけない
- OANDA を全部消す
- Dukascopy ベタ固定
- Twelve まで同時導入
- provider 差異を service 層の if 文で吸収

---

## 6. 実装優先順位

1. Provider 抽象の強化
2. Dukascopy 正規化
3. `market_candles` への保存
4. 研究テーブル
5. reliability API
6. connectors 一般化
7. 将来 Twelve 追加

---

## 7. 最終判断

### 本質
FXDE の provider 設計で一番大事なのは、
**どの API を選ぶか** ではなく、
**選んだ API を差し替え可能な構造に押し込めるか** である。

### よって
- 当面の互換: OANDA
- 研究主系: Dukascopy
- 将来の監視補助: Twelve

という分離は合理的である。
