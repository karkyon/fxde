# Dukascopy 仕様整理メモ（FXDE 実装前の罠整理）

## 0. 結論

Dukascopy を FXDE に入れるときの本質は  
**「APIを足すこと」ではなく、「Dukascopy のデータ特性を internal canonical に正規化すること」**  
である。

---

## 1. まず押さえるべき前提

Dukascopy は Twelve Data や OANDA のような
「アプリ向け market-data SaaS API」と同じ感覚では扱えない。

FXDE で重要なのは:
- 高精度履歴
- D1 / W1 / H4 研究
- パターン出現後の forward 検証
- provider provenance の保持

したがって、初期実装の主眼は
- **履歴取得**
- **範囲取得**
- **正規化**
- **DB保存**
に置くべきである。

---

## 2. 実装時の主要な罠

## 2.1 時刻フォーマット差
OANDA:
- ISO8601 string 前提

Dukascopy:
- データ取得経路によって timestamp 形式差が出やすい

### 必須対応
- provider 側で UTC 正規化
- internal canonical では時刻表現を統一
- DB書き込み前に完全変換

---

## 2.2 incomplete bar / complete bar の扱い
研究用途では **未確定バーを混ぜると統計が壊れる**。

### 必須対応
- DukascopyProvider で `complete` を明示
- 研究用途の保存は原則 complete のみ
- latest 表示用は incomplete 許可の余地を分ける

---

## 2.3 volume の意味差
provider により volume の定義が異なる。
- 実出来高
- ティック数近似
- null

### 必須対応
- `volume: number | null`
- volume 前提ロジックは provider 依存と明示
- パターン研究の正本条件に volume を安易に組み込まない

---

## 2.4 timeframe 変換差
OANDA は granularity map
Dukascopy は別の単位系や取得方式になる可能性が高い。

### 必須対応
- `supportsTimeframe()` を provider 側で厳密に実装
- internal は `CanonicalTimeframe` に統一
- provider 側で only-supported ルールを返す

---

## 2.5 fetchRange の本質差
Dukascopy は **from/to 正本** に向く。  
ここが OANDA との差。

### 必須対応
- interface は from/to 基準
- provider ごとに取得方式を隠蔽
- service 層は count を前提にしない

---

## 2.6 大量履歴取得の chunk 問題
Dukascopy を履歴研究に使うなら、レンジ取得は chunk 化が必要になる可能性が高い。

### 必須対応
- provider 内部で chunk 分割
- service は chunk を知らない
- 冪等 upsert 前提で保存

---

## 2.7 研究結果を他 provider と混ぜない
Dukascopy 由来のパターン信頼度と、
将来 OANDA / Twelve 由来の信頼度を混ぜると統計が歪む。

### 必須対応
- research tables に provider 保持
- reliability API でも provider filter を持つ
- UI でも source を明示できるようにする

---

## 3. 初期実装範囲（推奨）

### 必須
- `providerId = 'dukascopy'`
- `isConfigured()`
- `supportsTimeframe()`
- `fetchLatestBar()`
- `fetchRange()`
- `healthCheck()`
- `toCanonical()` 正規化
- complete bar 制御

### まだ不要
- リアルタイム streaming
- 秒単位通知
- fallback provider 自動切替
- UI provider switch

---

## 4. Phase 2 実装時の推奨ルール

1. まず DukascopyProvider 単体実装
2. 次に registry 登録
3. その次に MarketDataService から active provider として利用
4. その後に `market_candles` へ upsert
5. 最後に Chart / research 側へ流す

---

## 5. 一番危ない失敗

### 危険な実装
- OANDA の fetchRange 実装をコピペして Dukascopy に当てる
- time/string/volume をそのまま保存する
- incomplete bar を研究テーブルに混ぜる
- provider ごとの差を service 側 if 文で吸収する

### 正しい実装
- provider 内で差異吸収
- service 層は canonical だけ扱う
- 研究用途は complete bar のみ基準
- provider provenance を保持

---

## 6. 総括

Dukascopy 導入の成功条件は、
**「取得できること」ではなく「他 provider と混ざらず、研究に使える canonical data へ正規化できること」**。

つまり Phase 2 の本質は
**Dukascopy API 実装**
ではなく
**Dukascopy 正規化実装**
である。
