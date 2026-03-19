# FX Discipline Engine — 統合仕様書 v5.1
## SPEC-v5.1 / Part 8 : MTF 予測アルゴリズム · DTW 類似検索 · 精度検証 · 自己学習フィードバックループ

---

## A. v5.1 実装対象（物理分離版）

> **本ブロックが v5.1 実装対象の正本である。**
> v5.1 実装者・AI コード生成・自動開発プロセスは、まず本ブロックのみを参照すること。
> v6 以降の設計資料は後半の **B. v6 設計資料** に物理分離して収録する。
>
> **章番号について**: A ブロックの章番号は §0 / §2 / §8 / §9 となっており、欠番がある。
> これは旧章番号（v6 設計資料）を B ブロックへ物理移設した結果であり、意図的な欠番である。
> v5.1 実装者は §0・§2・§8・§9 のみを参照すること。

### A.0 実装境界ルール

- v5.1 で実装するのは以下のみ。
  - Prediction Job 登録 API
  - Prediction Status API
  - Prediction Result API
  - MTF 重み設定（v5.1 確定値）
  - AI 市場要約機能
  - `prediction-dispatch` BullMQ ワーカーによる固定 JSON 書き込み
- DTW / 特徴量抽出 / HMM / WFV / 自動重み学習は **v6 設計資料** であり、v5.1 では実装してはならない。
- コード例が存在しても、B ブロックの内容は v5.1 の生成対象に含めてはならない。

---

## 0. v5.1 実装スコープ（重要）

> **v5.1 では Prediction Engine 本体はスタブ実装のみ。**
> v5.1 の Prediction Engine 本体として実装してよいのは、**§9「Prediction Service プロセス設計（v5.1: スタブのみ実装）」のみ**とする。
> **§2「MTF 重み付けモデル」および §8「AI 市場要約機能」は v5.1 実装対象だが、Prediction Engine 本体ではなく、UI / API の周辺機能である。**
> DTW・特徴量抽出・HMM・WFV・自動重み学習はすべて **v6 設計ドキュメント** であり、v5.1 では実装してはならない。

| バージョン | 実装内容 |
|---------|---------|
| v5.1（現在）| Prediction Engine 本体はスタブのみ（ジョブ受付 / ステータス管理 / STUB_PREDICTION_RESULT 固定 JSON 返却） |
| v5.1（周辺機能）| MTF 重み設定 UI / TF 重み保存 API / AI 市場要約機能 |
| v6（将来）| DTW 類似検索 / シナリオ生成 / HMM 分類 / 精度検証 / 重み学習 |

---

---

## 2. MTF 重み付けモデル（確定値 / v5.1 周辺機能）
> ✅ **v5.1 実装対象セクション**
> このセクションは v5.1 PoC の実装対象である。
> **ただし Prediction Engine 本体ではない。**
> 本セクションは Prediction UI / 設定 API の周辺機能として実装する。


### 2.1 デフォルト重みテーブル

| エントリー足 | W1 | D1 | H8 | H4 | H1 | M30 | M15 | M5 |
|-----------|:--:|:--:|:--:|:--:|:--:|:---:|:---:|:--:|
| H4（推奨） | 30% | 25% | — | 20% | 15% | 10% | — | — |
| H1 | — | 30% | — | 25% | 20% | 15% | 10% | — |
| D1 | — | — | 20% | — | — | — | — | — |
| D1（詳細）| MN:15% | W1:30% | — | D1:25% | H8:15% | H4:15% | — | — |
| M15 | — | — | — | 30% | 25% | 20% | 15% | 10% |

### 2.2 重み設定のデータ構造

```typescript
// packages/types/src/prediction.ts

// Timeframe は Prisma enum（Part 2 準拠）: M1 | M5 | M15 | M30 | H1 | H4 | H8 | D1 | W1 | MN
export type Timeframe = 'M1' | 'M5' | 'M15' | 'M30' | 'H1' | 'H4' | 'H8' | 'D1' | 'W1' | 'MN';

// TfWeight: ある Timeframe を基準とした参照先時間足ごとの重み
// 参照する時間足が存在しない場合は undefined（Partial）
export type TfWeight = Partial<Record<Timeframe, number>>;

// DEFAULT_TF_WEIGHTS: エントリー足ごとに定義された重みテーブル
// Partial<Record<Timeframe, TfWeight>> を使用し、
// 明示的に設定した H4 / H1 / D1 / M15 のみが定義値を持つ。
// それ以外のエントリー足（M1 / M5 / M30 / H8 / W1 / MN）は undefined となるため、
// 使用時は ?? DEFAULT_TF_WEIGHTS.H4 でフォールバックすること。
export const DEFAULT_TF_WEIGHTS: Partial<Record<Timeframe, TfWeight>> = {
  H4:  { W1: 0.30, D1: 0.25, H4: 0.20, H1: 0.15, M30: 0.10 },
  H1:  { D1: 0.30, H4: 0.25, H1: 0.20, M30: 0.15, M15: 0.10 },
  D1:  { MN: 0.15, W1: 0.30, D1: 0.25, H8: 0.15, H4: 0.15 },
  M15: { H4: 0.30, H1: 0.25, M30: 0.20, M15: 0.15, M5:  0.10 },
};

// フォールバックヘルパー
export function getTfWeights(entryTf: Timeframe): TfWeight {
  return DEFAULT_TF_WEIGHTS[entryTf] ?? DEFAULT_TF_WEIGHTS.H4!;
}
```

### 2.3 ユーザーによるスライダー調整（UI）

```
各時間足の重みをスライダーで 5%〜50% の範囲で調整可能。
合計が 100% になるよう自動正規化する。

制約:
  最小値: 5%（0 にはできない）
  最大値: 50%（1 足に偏りすぎない）
  変更後: PATCH /api/v1/predictions/jobs/{id}/tf-weights で保存
  「デフォルトに戻す」ボタンで DEFAULT_TF_WEIGHTS に戻す
```

---

---

## 8. AI 市場要約機能（Claude API 連携 / v5.1 周辺機能）
> ✅ **v5.1 実装対象セクション**
> このセクションは v5.1 PoC の実装対象である。
> **ただし Prediction Engine 本体ではない。**
> 本セクションはダッシュボード / Snapshot 表示の補助要約機能として実装する。


### 8.1 プロンプト設計

```typescript
// apps/api/src/ai-summary/ai-summary.service.ts

const SYSTEM_PROMPT = `
あなたは FX 市場の分析アシスタントです。
与えられた指標データを元に、初心者にも分かりやすく現在の市場状況を
日本語で要約してください。
技術用語は使う場合は必ず説明を添えてください。
200 字以内で。最後に必ず「最終判断はご自身でお願いします。」で締めてください。
`;

// モデル名は環境変数で管理する（ANTHROPIC_MODEL）
// デフォルト: claude-sonnet-4-20250514
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-20250514';

// タイムアウト: 10 秒
// 再試行方針: HTTP 429（レートリミット）および 5xx（サーバーエラー）は
//   呼び出し元 BullMQ ワーカーの attempts: 3 / backoff: exponential に委ねる
// 認証: x-api-key ヘッダに環境変数 ANTHROPIC_API_KEY を使用
export async function generateAiSummary(snapshot: Snapshot): Promise<string> {
  const payload    = buildPromptPayload(snapshot);
  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         process.env.ANTHROPIC_API_KEY ?? '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      ANTHROPIC_MODEL,
        max_tokens: 400,
        system:     SYSTEM_PROMPT,
        messages:   [{ role: 'user', content: JSON.stringify(payload) }],
      }),
      signal: controller.signal,
    });

    // 429 / 5xx はワーカー側リトライに委ねるため例外をスロー
    if (response.status === 429 || response.status >= 500) {
      throw new Error(`Anthropic API error: HTTP ${response.status}`);
    }

    const data = await response.json();
    return data.content[0]?.text ?? '要約の生成に失敗しました。';
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildPromptPayload(snap: Snapshot) {
  const ind = snap.indicators as IndicatorsData;
  const ptns = snap.patterns as PatternData[];
  const mtf  = snap.mtfAlignment as MtfAlignmentData;

  return {
    pair:            snap.symbol,
    score:           snap.scoreTotal,
    entryState:      snap.entryState,
    indicators: {
      ma:   { status: ind.ma.crossStatus, slope: ind.ma.slope > 0 ? 'upward' : 'downward' },
      rsi:  { value: ind.rsi.value, divergence: ind.rsi.divergence },
      macd: { histogram: ind.macd.histogram, crossStatus: ind.macd.crossStatus },
      atr:  { ratio: ind.atr.ratio, status: ind.atr.ratio <= 1.2 ? 'normal' : 'high' },
    },
    patterns: ptns.map(p => ({ name: p.name, confidence: p.confidence })),
    mtf:      Object.fromEntries(
      Object.entries(mtf).map(([tf, v]) => [tf, v.direction])
    ),
  };
}
```

### 8.2 AI シナリオテキスト自動生成

```typescript
const SCENARIO_PROMPT = `
以下の予測データから、3 つのシナリオを日本語で各 50 字以内で説明してください。
強気・レンジ・弱気の順に、初心者が読んで「今何をすべきか」が分かる文を生成してください。
JSON 形式で返してください:
{ "bull": "string", "neutral": "string", "bear": "string" }
`;
```

### 8.3 FREE プランのレート制限

```typescript
// FREE: 0回（AI要約不可）/ BASIC: 3回/日 / PRO | PRO_PLUS | ADMIN: 無制限
// BullMQ の ai-summary キューで管理
// Rate Limit の実装: Redis INCR + EXPIRE

async function checkAiSummaryLimit(userId: string, role: UserRole): Promise<boolean> {
  // 無制限: PRO | PRO_PLUS | ADMIN
  // 3回/日: BASIC
  // 禁止: FREE
  const UNLIMITED_ROLES = ['PRO', 'PRO_PLUS', 'ADMIN'] as const;
  if (UNLIMITED_ROLES.includes(role as typeof UNLIMITED_ROLES[number])) return true;
  const key   = `ai-summary-limit:${userId}:${new Date().toDateString()}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 86400); // 24 時間
  return count <= 3;
}
```

---

---

## 9. Prediction Service プロセス設計（**v5.1: スタブのみ実装** / v6: 本実装）
> ✅ **v5.1 実装対象セクション**
> このセクションは v5.1 PoC の実装対象である。

> **v5.1 の Prediction Engine 本体は本セクションのみが実装対象である。**  
> Prediction Service を独立プロセスとして起動してはならない。  
> `prediction-dispatch` BullMQ ワーカーが固定 JSON（`STUB_PREDICTION_RESULT`）を  
> `PredictionResult` テーブルに書き込み、ジョブを `SUCCEEDED` にする。  
> DTW 類似検索・シナリオ生成・HMM 状態分類・WFV・自動重み学習は **v6 で本実装**。  
> それらの詳細設計・コード例は **B. v6 設計資料** に物理移設して保持する。  
> **本セクション以外の Prediction Engine 実装は禁止。**

### 9.1 v5.1 サービス構成（スタブのみ）

```
fxde/
├── apps/
│   └── api/
│       └── src/
│           ├── predictions/          ← Job 登録 / Status / Result API
│           └── jobs/
│               └── prediction-dispatch.processor.ts
└── packages/
    └── types/
```

### 9.2 v5.1 ジョブ処理フロー（固定 JSON）

```typescript
// apps/api/src/jobs/prediction-dispatch.processor.ts
// v5.1 では NestJS API 内の BullMQ Processor として動作させる

worker.on('active', async (job: Job<PredictionDispatchJobData>) => {
  const { jobId } = job.data;

  await db.predictionJob.update({
    where: { id: jobId },
    data: { status: 'RUNNING', startedAt: new Date() },
  });

  try {
    await db.predictionResult.upsert({
      where: { jobId },
      update: { resultData: STUB_PREDICTION_RESULT },
      create: { jobId, resultData: STUB_PREDICTION_RESULT },
    });

    await db.predictionJob.update({
      where: { id: jobId },
      data: { status: 'SUCCEEDED', finishedAt: new Date() },
    });
  } catch (error) {
    await db.predictionJob.update({
      where: { id: jobId },
      data: { status: 'FAILED', finishedAt: new Date(), errorMessage: String(error) },
    });
    throw error;
  }
});
```

### 9.3 STUB_PREDICTION_RESULT（固定返却データ）

```typescript
export const STUB_PREDICTION_RESULT = {
  scenarios: {
    bull:    { probability: 0.63, target: '+0.8%', horizonBars: 12 },
    neutral: { probability: 0.22, target: '+0.1%', horizonBars: 12 },
    bear:    { probability: 0.15, target: '-0.5%', horizonBars: 12 },
  },
  stats: {
    matchedCases: 0,
    confidence: 0.55,
    note: 'v5.1 STUB result',
  },
  tfWeights: null,
  hmmState: null,
};
```

### 9.4 v5.1 パフォーマンス要件（スタブ）

| 処理 | 目標時間 | 実現方法 |
|------|---------|---------|
| Prediction Job 登録 | < 300ms | DB insert のみ |
| Prediction Status 取得 | < 200ms | DB read のみ |
| Prediction Result 取得 | < 200ms | DB read のみ |
| prediction-dispatch 実行 | < 1 秒 | 固定 JSON 書き込み |
| 合計（ジョブ全体） | < 3 秒 | BullMQ Processor |

---

*Part 8 完了 — 次: Part 9 → SaaS 設計 · 料金プラン · 競合差別化 · AI 要約設計思想 · 収益シミュレーション*

---

## B. v6 設計資料（参考・実装禁止）

> **本ブロックは v6 以降の設計資料である。**
> 既存内容は削除せず保持するが、v5.1 実装対象には含めない。
> v5.1 実装者・AI コード生成は、本ブロックのコードおよびロジックを生成・実装してはならない。

### B.0 参照ルール

- 本ブロックは将来実装のための設計保持が目的である。
- v5.1 の PoC 実装・E2E・UI 結線は、A ブロックのスタブ結果を使用して進めること。
- v6 着手時は、本ブロックを起点に Prediction Service を別プロセスへ拡張する。

---

### B.0.1 A ブロック旧保持内容（v6 側へ物理移設・実装禁止）

> 以下は、以前 A ブロックに含まれていた Prediction Service 本実装向け内容を、
> **既存内容を削除せず保持するために v6 側へ移設したもの**である。
> v5.1 では参照のみ可、実装は禁止。

#### 旧 9. Prediction Service プロセス設計（v6 側保持版）
> ⛔ **v5.1 実装禁止セクション（v6 設計ドキュメント）**
> このセクションは v6 以降の設計資料である。
> v5.1 実装者はこのセクションのコードを生成・実装してはならない。
> v5.1 の Prediction Engine 本体は A ブロック §9「Prediction Service プロセス設計（v5.1: スタブのみ実装）」のみが実装対象である。

> **v6 実装方針**: Prediction Service は独立プロセスとして起動する。  
> DTW 類似検索・シナリオ生成・HMM 状態分類は **v6 で本実装**。  
> 本章の実装コードは v6 への設計仕様として保持する。


### 9.1 サービス構成（v6）

```
fxde/
└── services/
    └── prediction/
        ├── src/
        │   ├── features/     ← 特徴量抽出
        │   ├── similarity/   ← DTW・コサイン類似度
        │   ├── scenarios/    ← シナリオ生成
        │   ├── hmm/          ← 相場状態分類
        │   ├── learning/     ← 重み更新・オンライン学習
        │   ├── validation/   ← WFV・精度計算
        │   └── main.ts       ← BullMQ Worker エントリ
        ├── package.json
        └── tsconfig.json
```

### 9.2 ジョブ処理フロー（v6）

```typescript
// services/prediction/src/main.ts
// BullMQ Worker として NestJS API から独立して動作

worker.on('active', async (job: Job<PredictionDispatchJobData>) => {
  const { jobId } = job.data;

  // 1. DB から PredictionJob を取得
  await db.predictionJob.update({ where: { id: jobId }, data: { status: 'RUNNING', startedAt: new Date() } });

  try {
    const pJob = await db.predictionJob.findUniqueOrThrow({ where: { id: jobId } });
    const req  = pJob.requestData as PredictionRequest;

    // 2. 現在の特徴量を計算
    const currentFeatures = await extractMultiTfFeatures(pJob.symbol, pJob.timeframe);

    // 3. 類似局面を検索
    const cases = await searchSimilarCases(currentFeatures, pJob.symbol, pJob.timeframe,
      getTfWeights(pJob.timeframe as Timeframe), {
        lookbackYears: req.lookbackYears ?? 5,
        minSimilarity: req.minSimilarity ?? 0.65,
        topK:          req.topK ?? 20,
      });

    // 4. シナリオ生成
    const currentPrice = await getLatestPrice(pJob.symbol);
    const scenarios    = generateScenarios(cases, currentPrice, pJob.timeframe);

    // 5. 統計計算
    const stats = calcPredictionStats(cases);

    // 6. HMM 状態分類
    const hmmState = classifyMarketState(/* adx, atrRatio */);

    // 7. 結果を DB に保存
    await db.predictionResult.create({
      data: {
        jobId,
        resultData: { scenarios, matchedCases: cases, stats, tfWeights: getTfWeights(pJob.timeframe as Timeframe), hmmState },
      },
    });
    await db.predictionJob.update({ where: { id: jobId }, data: { status: 'SUCCEEDED', finishedAt: new Date() } });

  } catch (error) {
    await db.predictionJob.update({
      where: { id: jobId },
      data:  { status: 'FAILED', finishedAt: new Date(), errorMessage: String(error) },
    });
    throw error;
  }
});
```

### 9.3 パフォーマンス要件（v6）

| 処理 | 目標時間 | 実現方法 |
|------|---------|---------|
| 特徴量抽出（全 TF）| < 1 秒 | Redis キャッシュから計算済みインジケータを取得 |
| DTW 類似局面検索 | < 3 秒 | Sakoe-Chiba バンド + 事前正規化インデックス |
| シナリオ生成 | < 500ms | パーセンタイル計算（in-memory）|
| AI 要約生成 | < 5 秒 | Claude API（非同期。別キュー）|
| 合計（ジョブ全体）| < 10 秒 | BullMQ のタイムアウト設定 30 秒 |

---


## 1. MTF 予測機能 概要
> ⛔ **v5.1 実装禁止セクション（v6 設計ドキュメント）**
> このセクションは v6 以降の設計資料である。
> v5.1 実装者はこのセクションのコードを生成・実装してはならない。
> **AI コード生成時**: Part 1 確定宣言（0-4, 0-15）を優先し、本セクションを生成対象に含めないこと。

---

## 1.5 Prediction Service のデータ設計（ETL）

### 特徴量ソース
```
Prediction Service は独立したDBを持たない。
snapshots テーブルの JSONB カラム（indicators, patterns, mtfAlignment）を
特徴量ソースとして使用する。

データフロー:
  [外部API] → price-sync (5分) → Redis (Candle Cache)
                                 ↓
              snapshot-capture (15分) → snapshots テーブル (JSONB保存)
                                        ↓
              prediction-dispatch (イベント駆動) → snapshots を読み込み
                                                    ↓
                                                  特徴量抽出 (extractFeatures)
                                                    ↓
                                                  DTW類似検索 (v6) / スタブ (v5.1)
                                                    ↓
                                                  prediction_results テーブルへ保存
```

### v5.1 での制約（スタブ実装）
```
v5.1 では prediction-dispatch ワーカーは以下のみ実装する:
  1. PredictionJob.status = 'RUNNING'
  2. STUB_PREDICTION_RESULT（固定JSON）を prediction_results に書き込む
  3. PredictionJob.status = 'SUCCEEDED'

STUB_PREDICTION_RESULT の内容:
  - scenarios[0]: bull 63% / neutral 22% / bear 15%（固定値）
  - matchedCases: 4件の固定サンプルデータ
  - stats.sampleSize = 47, pValue = 0.032（固定値）
  - [SAMPLE] ラベル付き — 実測値ではない

UI開発・E2Eテストはこのスタブで進められる。
```

### v6 での本実装スコープ
```
v6 で追加する処理:
  1. snapshots.indicators JSONB → TfFeatureVector への変換
  2. 過去 N 年分の snapshots から DTW 類似検索（Sakoe-Chiba バンド）
  3. 類似局面の「その後の価格推移」を candles テーブルから取得
  4. パーセンタイル計算 → シナリオ生成
  5. HMM 状態分類（ADX + ATR から判定）
  6. prediction_results に実結果を保存

v6 で必要になる追加インデックス（migration で追加）:
  CREATE INDEX idx_snapshots_symbol_tf_captured
    ON snapshots (symbol, timeframe, captured_at DESC);
  -- DTW 検索の WHERE 句を高速化するために必須
```


> **実装区分**: Prediction Service（別プロセス）  
> NestJS API は「ジョブ登録 / 結果取得」のみ担当（Part 3・4 参照）。  
> 推論処理は Python / TypeScript の独立サービスで実行し、完了後に DB へ書き込む。

### 1.1 設計思想

```
「現在の市場構造が過去にどんな局面に似ており、その後どうなったか」を
マルチタイムフレームで分析し、確率付きの未来チャートを描画する。

入力: 現在の相場状況（週足〜下位足の多重構造）
処理: 過去 10 年分の類似局面を DB から検索（DTW）
出力: 確率付き未来チャート（3 シナリオ）+ 統計的信頼性指標
```

### 1.2 理論的背景

#### フラクタル構造理論

```
FX 相場は時間足をまたいで自己相似的（フラクタル）な構造を持つ。

週足のトレンドは日足の押し目を作り、
日足の押し目は 4 時間足のパターンを形成し、
4 時間足のパターンは 1 時間足のエントリーシグナルを生む。

→ 下位足の動きが揃って初めて上位足のトレンドが確認できる。
→ 複数時間足の整合性こそが予測の根拠になる。
```

---

---

## 3. 特徴量ベクトル定義
> ⛔ **v5.1 実装禁止セクション（v6 設計ドキュメント）**
> このセクションは v6 以降の設計資料である。
> v5.1 実装者はこのセクションのコードを生成・実装してはならない。
> AI 実装時は Part 1 確定宣言（0-15）を優先し、本セクションを無視すること。


### 3.1 各時間足から抽出する特徴量

```typescript
// prediction-service/src/features/feature-extractor.ts

export interface TfFeatureVector {
  // テクニカル特徴量
  trendDirection:  -1 | 0 | 1;      // −1: 下降 / 0: 中立 / +1: 上昇
  maSlope:         number;           // EMA50 の傾き（正規化）
  rsiNorm:         number;           // RSI を −1〜+1 に正規化 (rsi/50 - 1)
  atrRatio:        number;           // 現在 ATR / 30 本平均 ATR
  macdHistSign:    number;           // MACD ヒストグラムの符号と正規化値
  bbPosition:      number;           // BB 内の位置 (−1〜+1)
  patternCode:     number;           // 検出パターン（エンコード 0〜12）
  adxValue:        number;           // ADX（トレンド強度）正規化

  // 形状特徴量
  priceSeriesNorm: number[];         // 過去 20 本終値の 0〜1 正規化シリーズ
  highLowSlope:    number;           // 高値・安値の切り上げ/切り下げ傾き
  volumeRatio:     number | null;    // 出来高比率（データなし時 null）
}

export function extractFeatures(
  candles: Candle[],
  indicators: IndicatorsData,
  patterns: PatternData[],
): TfFeatureVector {
  const closes  = candles.map(c => c.close);
  const minP    = Math.min(...closes);
  const maxP    = Math.max(...closes);
  const norm    = closes.slice(-20).map(v => (v - minP) / (maxP - minP || 1));

  return {
    trendDirection:  indicators.ma.ma50 > indicators.ma.ma200 ? 1 : -1,
    maSlope:         indicators.ma.slope,
    rsiNorm:         indicators.rsi.value / 50 - 1,
    atrRatio:        indicators.atr.ratio,
    macdHistSign:    Math.sign(indicators.macd.histogram) *
                     Math.min(1, Math.abs(indicators.macd.histogram) / 0.005),
    bbPosition:      calcBbPosition(candles.slice(-1)[0].close, indicators.bb),
    patternCode:     encodePattern(patterns),
    adxValue:        indicators.adx ? indicators.adx / 50 : 0.5,
    priceSeriesNorm: norm,
    highLowSlope:    calcHighLowSlope(candles.slice(-20)),
    volumeRatio:     null,
  };
}
```

---

---

## 4. DTW（Dynamic Time Warping）類似局面検索
> ⛔ **v5.1 実装禁止セクション（v6 設計ドキュメント）**
> このセクションは v6 以降の設計資料である。
> v5.1 実装者はこのセクションのコードを生成・実装してはならない。
> AI 実装時は Part 1 確定宣言（0-15）を優先し、本セクションを無視すること。


### 4.1 アルゴリズム概要

```
通常のユークリッド距離: 「形が同じでもタイミングがズレると別物」と判定
DTW: 時間軸の伸縮を許容して形状的類似性を計算 → FX チャートに最適
```

### 4.2 DTW 実装（TypeScript）

```typescript
// prediction-service/src/similarity/dtw.ts

export function dtwDistance(series1: number[], series2: number[]): number {
  const n = series1.length;
  const m = series2.length;

  // コスト行列の初期化（メモ化）
  const dtw: number[][] = Array.from({ length: n + 1 }, () =>
    new Array(m + 1).fill(Infinity)
  );
  dtw[0][0] = 0;

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = Math.abs(series1[i - 1] - series2[j - 1]);
      dtw[i][j] = cost + Math.min(
        dtw[i - 1][j],      // 挿入
        dtw[i][j - 1],      // 削除
        dtw[i - 1][j - 1],  // 一致
      );
    }
  }
  return dtw[n][m];
}

// Sakoe-Chiba バンド制約（高速化 + 精度向上）
// ウィンドウ幅 w 以上離れた比較は禁止
export function dtwDistanceWindowed(
  series1: number[],
  series2: number[],
  windowPct = 0.2,  // 系列長の 20% をウィンドウとする
): number {
  const n = series1.length;
  const m = series2.length;
  const w = Math.ceil(Math.max(n, m) * windowPct);

  const dtw: number[][] = Array.from({ length: n + 1 }, () =>
    new Array(m + 1).fill(Infinity)
  );
  dtw[0][0] = 0;

  for (let i = 1; i <= n; i++) {
    const jStart = Math.max(1, i - w);
    const jEnd   = Math.min(m, i + w);
    for (let j = jStart; j <= jEnd; j++) {
      const cost = Math.abs(series1[i - 1] - series2[j - 1]);
      dtw[i][j] = cost + Math.min(
        dtw[i - 1][j],
        dtw[i][j - 1],
        dtw[i - 1][j - 1],
      );
    }
  }
  return dtw[n][m];
}

// DTW 距離を類似度スコア（0.0〜1.0）に変換
export function dtwToSimilarity(distance: number, seriesLength: number): number {
  const normalizedDist = distance / seriesLength;
  return Math.max(0, 1 - normalizedDist);
}
```

### 4.3 マルチタイムフレーム総合類似度

```typescript
// prediction-service/src/similarity/mtf-similarity.ts

export function calcMtfSimilarity(
  currentFeatures:  Record<Timeframe, TfFeatureVector>,
  historicalFeatures: Record<Timeframe, TfFeatureVector>,
  tfWeights:        TfWeight,
): number {
  let totalSimilarity = 0;
  let totalWeight     = 0;

  for (const [tf, weight] of Object.entries(tfWeights) as [Timeframe, number][]) {
    const curr = currentFeatures[tf];
    const hist = historicalFeatures[tf];
    if (!curr || !hist) continue;

    // 1. 価格形状の DTW 類似度（重み 60%）
    const dtwSim = dtwToSimilarity(
      dtwDistanceWindowed(curr.priceSeriesNorm, hist.priceSeriesNorm),
      20,
    );

    // 2. 指標特徴量のコサイン類似度（重み 40%）
    const featureVec1 = toFeatureArray(curr);
    const featureVec2 = toFeatureArray(hist);
    const cosineSim   = cosineSimilarity(featureVec1, featureVec2);

    const tfSimilarity = dtwSim * 0.6 + cosineSim * 0.4;
    totalSimilarity   += tfSimilarity * weight;
    totalWeight       += weight;
  }

  return totalWeight > 0 ? totalSimilarity / totalWeight : 0;
}

function toFeatureArray(fv: TfFeatureVector): number[] {
  return [
    fv.trendDirection,
    fv.maSlope,
    fv.rsiNorm,
    fv.atrRatio,
    fv.macdHistSign,
    fv.bbPosition,
    fv.adxValue,
    fv.highLowSlope,
  ];
}

function cosineSimilarity(a: number[], b: number[]): number {
  const dot    = a.reduce((s, v, i) => s + v * b[i], 0);
  const normA  = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
  const normB  = Math.sqrt(b.reduce((s, v) => s + v * v, 0));
  return (normA * normB) === 0 ? 0 : (dot / (normA * normB) + 1) / 2; // 0〜1 に正規化
}
```

### 4.4 類似局面検索パイプライン

```typescript
// prediction-service/src/similarity/search-engine.ts

export interface SimilarCase {
  date:        string;
  similarity:  number;    // 0.0〜1.0
  result:      'bull' | 'bear' | 'neutral';
  pips:        number;    // その後の最大 pips（正: 上昇 / 負: 下落）
  duration:    number;    // 最大値到達までのバー数
  priceAfter:  number[];  // その後 100 本の価格シリーズ（正規化）
}

export async function searchSimilarCases(
  currentFeatures: Record<Timeframe, TfFeatureVector>,
  symbol:          string,
  entryTf:         Timeframe,
  tfWeights:       TfWeight,
  options: {
    lookbackYears:  number;   // default: 5
    minSimilarity:  number;   // default: 0.65
    topK:           number;   // default: 20
  },
): Promise<SimilarCase[]> {
  // 1. DB から過去データの特徴量を取得（事前計算済みインデックス）
  const historicalSnapshots = await db.snapshots.findMany({
    where: {
      symbol,
      timeframe: entryTf,
      capturedAt: { gte: subYears(new Date(), options.lookbackYears) },
    },
    orderBy: { capturedAt: 'asc' },
  });

  // 2. 各過去局面との類似度を計算
  const similarities: { snapshot: Snapshot; similarity: number }[] = [];
  for (const snap of historicalSnapshots) {
    const histFeatures = deserializeFeatures(snap.indicators);
    const sim = calcMtfSimilarity(currentFeatures, histFeatures, tfWeights);
    if (sim >= options.minSimilarity) {
      similarities.push({ snapshot: snap, similarity: sim });
    }
  }

  // 3. 類似度降順でソートし Top-K を取得
  const topK = similarities
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, options.topK);

  // 4. 各局面の「その後の価格推移」を取得して SimilarCase を構築
  return Promise.all(topK.map(async ({ snapshot, similarity }) => {
    const futureCandles = await getFutureCandles(snapshot, 100);
    const pips          = calcMaxPips(futureCandles);
    const result        = pips >= 10 ? 'bull' : pips <= -10 ? 'bear' : 'neutral';
    return {
      date:       snapshot.capturedAt.toISOString(),
      similarity,
      result,
      pips,
      duration:   findPeakBar(futureCandles),
      priceAfter: normalizePrices(futureCandles),
    };
  }));
}
```

### 4.5 類似度閾値と警告表示

| 全体類似度 | ラベル | 表示 |
|-----------|--------|------|
| 0.85〜1.0 | 非常に類似 | `●●●●●` 濃緑 |
| 0.75〜0.85 | 高い類似 | `●●●●○` 緑 |
| 0.65〜0.75 | 類似 | `●●●○○` 黄緑 |
| 0.50〜0.65 | やや類似 | `●●○○○` 黄（参考程度）|
| < 0.50 | 不一致 | 検索結果から除外 |

---

---

## 5. 未来チャート生成ロジック
> ⛔ **v5.1 実装禁止セクション（v6 設計ドキュメント）**
> このセクションは v6 以降の設計資料である。
> v5.1 実装者はこのセクションのコードを生成・実装してはならない。
> AI 実装時は Part 1 確定宣言（0-15）を優先し、本セクションを無視すること。


### 5.1 シナリオ生成アルゴリズム

```typescript
// prediction-service/src/scenarios/scenario-generator.ts

export interface PredictionScenario {
  id:           'bull' | 'neutral' | 'bear';
  label:        string;
  probability:  number;           // 0.0〜1.0
  color:        string;           // CSS 変数
  pricePoints:  { bar: number; price: number }[];
  confidenceBand: {              // ±1σ 不確実性バンド
    upper: { bar: number; price: number }[];
    lower: { bar: number; price: number }[];
  };
  maxPips:      number;
  avgTimeHours: number;
}

export function generateScenarios(
  similarCases:  SimilarCase[],
  currentPrice:  number,
  entryTf:       Timeframe,
): PredictionScenario[] {
  const FORECAST_BARS = 50;

  // 1. 類似局面のその後の価格を正規化して集約
  const normalized = similarCases.map(c => c.priceAfter.slice(0, FORECAST_BARS));

  // 2. バーごとのパーセンタイルを計算
  const percentiles = calcPercentilesPerBar(normalized, FORECAST_BARS);

  // 3. 結果で分類（bull / neutral / bear）
  const bullCases    = similarCases.filter(c => c.result === 'bull');
  const neutralCases = similarCases.filter(c => c.result === 'neutral');
  const bearCases    = similarCases.filter(c => c.result === 'bear');
  const n            = similarCases.length;

  // 4. 各シナリオの価格ポイント生成
  const BAR_CHECKPOINTS = [5, 10, 20, 30, 50];

  return [
    buildScenario('bull',    bullCases,    n, percentiles, currentPrice,
                  entryTf, BAR_CHECKPOINTS, '#2EC96A'),
    buildScenario('neutral', neutralCases, n, percentiles, currentPrice,
                  entryTf, BAR_CHECKPOINTS, '#E8B830'),
    buildScenario('bear',    bearCases,    n, percentiles, currentPrice,
                  entryTf, BAR_CHECKPOINTS, '#E05252'),
  ].sort((a, b) => b.probability - a.probability);
}

function calcPercentilesPerBar(
  series: number[][],
  bars:   number,
): { p25: number[]; p50: number[]; p75: number[] } {
  const p25 = [], p50 = [], p75 = [];
  for (let bar = 0; bar < bars; bar++) {
    const vals = series.map(s => s[bar] ?? 0).sort((a, b) => a - b);
    p25.push(vals[Math.floor(vals.length * 0.25)]);
    p50.push(vals[Math.floor(vals.length * 0.50)]);
    p75.push(vals[Math.floor(vals.length * 0.75)]);
  }
  return { p25, p50, p75 };
}
```

### 5.2 シナリオ構造（確定版 DB 保存形式）

```typescript
// PredictionResult.resultData の完全構造（Part 2 の JSONB 定義の詳細）
{
  scenarios: [
    {
      id:          'bull',
      label:       '強気シナリオ',
      probability: 0.63,
      color:       '#2EC96A',
      pricePoints: [
        { bar: 5,  price: 1.0862 },
        { bar: 10, price: 1.0890 },
        { bar: 20, price: 1.0920 },
        { bar: 30, price: 1.0948 },
        { bar: 50, price: 1.0965 },
      ],
      confidenceBand: {
        upper: [{ bar: 5, price: 1.0878 }, ...],
        lower: [{ bar: 5, price: 1.0846 }, ...],
      },
      maxPips:      123,
      avgTimeHours: 14,
    },
    {
      id:          'neutral',
      label:       'レンジシナリオ',
      probability: 0.22,
      ...
    },
    {
      id:          'bear',
      label:       '弱気シナリオ',
      probability: 0.15,
      ...
    },
  ],
  matchedCases: [
    { date: '2017/05/12', similarity: 0.89, result: 'bull', pips: 142, duration: 12 },
    { date: '2019/08/03', similarity: 0.84, result: 'bull', pips:  97, duration:  8 },
    { date: '2022/11/21', similarity: 0.81, result: 'bull', pips: 118, duration: 11 },
    { date: '2020/03/15', similarity: 0.76, result: 'bear', pips: -55, duration:  5 },
  ],
  stats: {
    avgWinPips:    119,
    avgLossPips:   -62,
    rr:            1.92,
    sampleSize:    47,
    pValue:        0.032,
    sharpeRatio:   1.74,
  },
  tfWeights: { W1: 0.30, D1: 0.25, H4: 0.20, H1: 0.15, M30: 0.10 },
  hmmState: {
    range:    0.15,
    trend:    0.72,
    crash:    0.13,
    current:  'trend',
  },
}
```

---

---

## 6. HMM（隠れマルコフモデル）相場状態分類
> ⛔ **v5.1 実装禁止セクション（v6 設計ドキュメント）**
> このセクションは v6 以降の設計資料である。
> v5.1 実装者はこのセクションのコードを生成・実装してはならない。
> AI 実装時は Part 1 確定宣言（0-15）を優先し、本セクションを無視すること。


### 6.1 状態定義

```
3 つの隠れ状態:
  State 0 (range):  レンジ相場（低ボラ・方向なし）
  State 1 (trend):  トレンド相場（高モメンタム・一方向）
  State 2 (crash):  クラッシュ/急騰（極高ボラ・ニュース起因）

各状態での勝率（バックテスト実績）:
  range:  44.8%  → 本システム回避推奨
  trend:  67.2%  → 本システムが最も有効
  crash:  38.2%  → 完全回避必須
```

### 6.2 簡易状態判定（v6 実装）

```typescript
// prediction-service/src/hmm/state-classifier.ts

export type MarketState = 'range' | 'trend' | 'crash';

export interface MarketStateProb {
  range: number;
  trend: number;
  crash: number;
  current: MarketState;
}

export function classifyMarketState(
  adx:      number,
  atrRatio: number,
): MarketStateProb {
  // クラッシュ: ATR が通常の 2.5 倍以上
  if (atrRatio >= 2.5) {
    return { range: 0.05, trend: 0.10, crash: 0.85, current: 'crash' };
  }
  // トレンド: ADX > 25 かつ ATR が正常範囲
  if (adx >= 25 && atrRatio <= 1.8) {
    const trendProb = Math.min(0.95, (adx - 25) / 25 * 0.7 + 0.5);
    return {
      range:   (1 - trendProb) * 0.8,
      trend:   trendProb,
      crash:   (1 - trendProb) * 0.2,
      current: 'trend',
    };
  }
  // レンジ: ADX < 20
  if (adx < 20) {
    return { range: 0.75, trend: 0.20, crash: 0.05, current: 'range' };
  }
  // 遷移中
  return { range: 0.35, trend: 0.55, crash: 0.10, current: 'trend' };
}
```

---

---

## 7. 精度検証・フィードバックループ
> ⛔ **v5.1 実装禁止セクション（v6 設計ドキュメント）**
> このセクションは v6 以降の設計資料である。
> v5.1 実装者はこのセクションのコードを生成・実装してはならない。
> AI 実装時は Part 1 確定宣言（0-15）を優先し、本セクションを無視すること。


### 7.1 自己改善ループ設計

```
AI 予測 → 未来チャート描画
    ↓
時間経過（実際の相場が動く）
    ↓
予測 vs 実績 比較・誤差計測（BullMQ: validation-job）
    ↓
精度評価（方向一致率 / MAE / PF 改善度）
    ↓
時間足重みの自動調整（Update tfWeights in DB）
    ↓
次回の予測精度向上
```

### 7.2 精度評価指標

#### 方向一致率（最重要指標）

```typescript
// packages/shared/src/validation-metrics.ts

export function calcDirectionalAccuracy(
  predictions: { direction: 'bull' | 'bear'; actualPips: number }[]
): number {
  const correct = predictions.filter(p =>
    (p.direction === 'bull' && p.actualPips > 0) ||
    (p.direction === 'bear' && p.actualPips < 0)
  ).length;
  return correct / predictions.length;
}
```

| 方向一致率 | 評価 |
|-----------|------|
| > 65% | ✅ 優秀（統計的優位性あり）|
| 55〜65% | 🟡 良好 |
| 50〜55% | ⚠️ 普通（ランダムに近い）|
| < 50% | 🔴 要改善 |

#### 予測誤差指標

```typescript
export function calcMAE(predictions: { predicted: number; actual: number }[]): number {
  return predictions.reduce((s, p) => s + Math.abs(p.predicted - p.actual), 0) / predictions.length;
}

export function calcRMSE(predictions: { predicted: number; actual: number }[]): number {
  return Math.sqrt(
    predictions.reduce((s, p) => s + Math.pow(p.predicted - p.actual, 2), 0) / predictions.length
  );
}

export function calcR2(predictions: { predicted: number; actual: number }[]): number {
  const mean   = predictions.reduce((s, p) => s + p.actual, 0) / predictions.length;
  const ssTot  = predictions.reduce((s, p) => s + Math.pow(p.actual - mean, 2), 0);
  const ssRes  = predictions.reduce((s, p) => s + Math.pow(p.actual - p.predicted, 2), 0);
  return 1 - ssRes / ssTot;
}
```

#### タイムステップ別精度（DB 保存 + グラフ表示）

```typescript
// GET /api/v1/predictions/accuracy/timestep  ← 正式定義: Part 3 § 11（PRO | PRO_PLUS | ADMIN）
interface TimestepAccuracy {
  bars:          number;   // +1 / +5 / +10 / +20 / +50 本後
  hoursAhead:    number;   // bars × エントリー足時間（H4 なら ×4）
  directional:   number;   // 方向一致率
  mae:           number;   // 平均絶対誤差（pips）
  sampleSize:    number;
}

// サンプルデータ（H4 エントリー足）
const TIMESTEP_SAMPLE: TimestepAccuracy[] = [
  { bars:  1, hoursAhead:  4, directional: 0.632, mae:  8.4, sampleSize: 120 },
  { bars:  5, hoursAhead: 20, directional: 0.618, mae: 18.2, sampleSize: 120 },
  { bars: 10, hoursAhead: 40, directional: 0.584, mae: 32.6, sampleSize: 115 },
  { bars: 20, hoursAhead: 80, directional: 0.551, mae: 48.9, sampleSize: 108 },
  { bars: 50, hoursAhead:200, directional: 0.513, mae: 72.4, sampleSize: 95  },
];
// → 「何本先まで信頼できるか」を可視化する
```

### 7.3 ウォークフォワード検証（WFV）

```typescript
// prediction-service/src/validation/walk-forward.ts

export interface WfvFold {
  foldIndex:   number;
  trainStart:  string;  // ISO date
  trainEnd:    string;
  testStart:   string;
  testEnd:     string;
  directional: number;
  pf:          number;
  sharpe:      number;
  mdd:         number;
  tradeCount:  number;
}

export interface WfvConfig {
  totalYears:    number;  // 例: 10
  trainYears:    number;  // 例: 3
  testYears:     number;  // 例: 1
  // → フォールド数 = (totalYears - trainYears) / testYears
}

// H4 の推奨設定: trainYears=3, testYears=1 → 7 フォールド
// H1 の推奨設定: trainYears=2, testYears=0.5（6ヶ月）

// サンプル WFV 結果
const WFV_SAMPLE: WfvFold[] = [
  { foldIndex: 1, trainStart: '2015-01-01', trainEnd: '2017-12-31',
    testStart: '2018-01-01', testEnd: '2018-12-31',
    directional: 0.638, pf: 1.68, sharpe: 1.42, mdd: -9.8,  tradeCount: 312 },
  { foldIndex: 2, trainStart: '2016-01-01', trainEnd: '2018-12-31',
    testStart: '2019-01-01', testEnd: '2019-12-31',
    directional: 0.621, pf: 1.59, sharpe: 1.31, mdd: -11.2, tradeCount: 298 },
  // ... フォールド 3〜7
];
```

### 7.4 時間足重みの自動学習

```typescript
// prediction-service/src/learning/weight-updater.ts

export function updateTfWeights(
  currentWeights: TfWeight,
  results: { tf: Timeframe; wasCorrect: boolean }[],
  alpha = 0.10,  // 学習率（ゆっくり更新）
): TfWeight {
  // 各時間足の精度を計算
  const tfAccuracy: Partial<Record<Timeframe, number>> = {};
  for (const [tf] of Object.entries(currentWeights)) {
    const tfResults = results.filter(r => r.tf === tf as Timeframe);
    if (tfResults.length === 0) {
      tfAccuracy[tf as Timeframe] = 0.5; // データなし → 中立
    } else {
      tfAccuracy[tf as Timeframe] = tfResults.filter(r => r.wasCorrect).length / tfResults.length;
    }
  }

  // 精度に基づく仮重みを計算（ソフトマックス）
  const rawScores: Partial<Record<Timeframe, number>> = {};
  for (const [tf, weight] of Object.entries(currentWeights) as [Timeframe, number][]) {
    rawScores[tf] = weight * (tfAccuracy[tf] ?? 0.5);
  }
  const total = Object.values(rawScores).reduce((s, v) => s + (v ?? 0), 0);

  // EMA で緩やかに更新
  const newWeights: TfWeight = {};
  for (const [tf, weight] of Object.entries(currentWeights) as [Timeframe, number][]) {
    const targetWeight = (rawScores[tf] ?? 0) / (total || 1);
    const updated      = (1 - alpha) * weight + alpha * targetWeight;
    // 暴走防止: 5%〜50% にクランプ
    newWeights[tf] = Math.max(0.05, Math.min(0.50, updated));
  }

  // 合計が 1.0 になるよう正規化
  const sum = Object.values(newWeights).reduce((s, v) => s + (v ?? 0), 0);
  for (const tf of Object.keys(newWeights) as Timeframe[]) {
    newWeights[tf] = (newWeights[tf] ?? 0) / sum;
  }

  return newWeights;
}

// 制約（暴走防止）
// 各時間足の最小値: 5%
// 各時間足の最大値: 50%
// 1 回の更新での最大変化: ±5%（学習率 α=0.10 で自動制限）
// 更新発動条件: 新規予測が最低 20 件以上蓄積
```

### 7.5 統計的信頼性の表示ルール

```typescript
// サンプルサイズ警告
export function getSampleWarning(n: number): { level: 'ok' | 'warn' | 'error'; message: string } {
  if (n >= 30) return { level: 'ok',   message: `N=${n} 件` };
  if (n >= 15) return { level: 'warn', message: `⚠️ N=${n} 件 — サンプルが少ないため信頼度低め` };
  return           { level: 'error', message: `🔴 N=${n} 件 — サンプル不足。参考程度にしてください` };
}

// P 値の表示
export function getPValueLabel(p: number): string {
  if (p < 0.05) return '✅ 統計的に有意（p<0.05）';
  if (p < 0.10) return '⚠️ やや有意（p<0.10）';
  return               '🔴 有意差なし（使用不推奨）';
}
```

---

---

*Part 8 完了 — 次: Part 9 → SaaS 設計 · 料金プラン · 競合差別化 · AI 要約設計思想 · 収益シミュレーション*
