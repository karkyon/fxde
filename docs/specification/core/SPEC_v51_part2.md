# FX Discipline Engine — 統合仕様書 v5.1
## SPEC-v5.1 / Part 2 : ER 図 · Prisma Schema · テーブル定義

> **参照ルール**: v5.1 設計書群（SPEC_v51_part1〜10.md）が唯一の真実。
> Part 10 に記載された内容が同一項目について本 Part と衝突する場合、**Part 10 を正本とする**。
> v4 設計書（ch01〜ch15.md）は参照禁止。

---

## 1. ER 図（全テーブル関係）

```
                    ┌─────────────────┐
                    │     users       │
                    │─────────────────│
                    │ id (PK)         │
                    │ email           │
                    │ password_hash   │
                    │ role            │
                    │ status          │
                    └────────┬────────┘
                             │ 1
          ┌──────────────────┼──────────────────┐
          │ N                │ 1                 │ N
          ▼                  ▼                   ▼
  ┌──────────────┐  ┌─────────────────┐  ┌──────────────────┐
  │   sessions   │  │  user_settings  │  │ symbol_settings  │
  │──────────────│  │─────────────────│  │──────────────────│
  │ id (PK)      │  │ id (PK)         │  │ id (PK)          │
  │ user_id (FK) │  │ user_id (FK,UQ) │  │ user_id (FK)     │
  │refresh_token │  │ preset          │  │ symbol           │
  │  _hash       │  │ score_threshold │  │ enabled          │
  │ expires_at   │  │ risk_profile    │  │ default_timeframe│
  │ revoked_at   │  │ ui_prefs        │  │ custom_threshold │
  └──────────────┘  │ feature_switches│  └──────────────────┘
                    │ force_lock      │   UNIQUE(user_id, symbol)
                    └─────────────────┘

          ┌──────────────────┬──────────────────┐
          │ N                │ N                 │ N
          ▼                  ▼                   ▼
  ┌──────────────┐  ┌─────────────────┐  ┌──────────────────┐
  │    trades    │  │   snapshots     │  │ prediction_jobs  │
  │──────────────│  │─────────────────│  │──────────────────│
  │ id (PK)      │  │ id (PK)         │  │ id (PK)          │
  │ user_id (FK) │  │ user_id (FK)    │  │ user_id (FK)     │
  │ symbol       │  │ symbol          │  │ symbol           │
  │ side         │  │ timeframe       │  │ timeframe        │
  │ entry_time   │  │ captured_at     │  │ request_data     │
  │ entry_price  │  │ indicators      │  │ status           │
  │ exit_time    │  │ patterns        │  │ started_at       │
  │ exit_price   │  │ mtf_alignment   │  │ finished_at      │
  │ size         │  │ score_total     │  │ error_message    │
  │ sl / tp      │  │ score_breakdown │  └────────┬─────────┘
  │ pnl / pips   │  │ entry_state     │           │ 1
  │ status       │  │ entry_context   │           ▼
  │ tags / note  │  └────────┬────────┘  ┌──────────────────┐
  └──────┬───────┘           │ 1:N        │prediction_results│
         │ 1                 ▼            │──────────────────│
         ▼           ┌──────────────┐    │ id (PK)          │
  ┌──────────────┐   │   signals    │    │ job_id (FK, UQ)  │
  │trade_reviews │   │──────────────│    │ result_data      │
  │──────────────│   │ id (PK)      │    │ (v5.1 = stub)    │
  │ id (PK)      │   │ user_id (FK) │    └──────────────────┘
  │ trade_id(UQ) │   │ snapshot_id  │
  │ score_at_    │   │ type         │    ┌──────────────────┐
  │   entry      │   │ triggered_at │    │  interest_rates  │
  │ rule_checks  │   │ acknowledged │    │ (共有マスタ)      │
  │ psychology   │   └──────────────┘    └──────────────────┘
  │ disciplined  │
  └──────────────┘                       ┌──────────────────┐
                                         │ economic_events  │
  ┌──────────────────────────────┐       │ (共有マスタ)      │
  │         audit_logs           │       └──────────────────┘
  │ id / user_id / action        │
  │ target_type / target_id      │
  │ metadata / ip_address        │
  └──────────────────────────────┘

  ── Chart 専用テーブル（Part 11 正本 / PG-07 用）────────────────

  ┌──────────────────┐  ┌──────────────────┐
  │  market_candles  │  │ indicator_cache  │
  │ OHLCV キャッシュ  │  │ インジ計算キャッシュ│
  └──────────────────┘  └──────────────────┘

  ┌──────────────────┐  ┌──────────────────┐
  │pattern_detections│  │  chart_snapshots │
  │ パターン検出ログ  │  │ チャート状態SS   │
  └──────────────────┘  └──────────────────┘

  Chart 専用テーブルの完全定義は Part 11（SPEC_v51_part11_chart_api.md）を参照。
```

---

## 2. Prisma Schema（完全版）

```prisma
// apps/api/prisma/schema.prisma
// v5.1 確定版 — このファイルが DB の唯一の真実

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ══════════════════════════════════════════
// ENUMS
// ══════════════════════════════════════════

enum UserRole {
  FREE      // ¥0    / 監視 1 ペアまで / ローソク足パターン 6 種 / SS 20 回/日
  BASIC     // ¥980  / 監視 4 ペアまで / 全 12 パターン / AI 要約 3 回/日 / CSV export
  PRO       // ¥2,980/ 監視 8 ペアまで / MTF 予測 / 精度検証（3 ヶ月）/ SS 無制限
  PRO_PLUS  // ¥4,980/ 監視 8 ペアまで / PRO 全機能 + WFV / 重み自動学習 / API アクセス
  ADMIN     // 社内運用 / 全機能 / ユーザー管理 / 監査ログ / ロール手動付与
}
// ※ SS = Snapshot（スナップショット）
// ※ 権限順序（低い順）: FREE < BASIC < PRO < PRO_PLUS < ADMIN
// ※ ロール比較の実装: const ROLES_PRO_OR_ABOVE = ['PRO','PRO_PLUS','ADMIN'] as const;
// ※ 「PRO以上」「有料ユーザー」などの曖昧表現禁止。上記定数か具体列挙を使うこと。

enum UserStatus {
  ACTIVE
  SUSPENDED
}

enum Preset {
  conservative  // 閾値85 / リスク0.5% / 最大連敗2
  standard      // 閾値75 / リスク1.0% / 最大連敗3
  aggressive    // 閾値70 / リスク2.0% / 最大連敗5
}

enum TradeSide {
  BUY
  SELL
}

enum TradeStatus {
  OPEN
  CLOSED
  CANCELED   // 論理削除扱い（物理削除はしない）
}

enum EntryState {
  ENTRY_OK    // 全条件クリア
  SCORE_LOW   // スコア不足
  RISK_NG     // RR < 1.0 またはロット超過
  LOCKED      // 強制ロック中（指標前後 / force_lock）
  COOLDOWN    // クールダウン中
}

enum Timeframe {
  M1 M5 M15 M30 H1 H4 H8 D1 W1 MN
}

enum JobStatus {
  QUEUED
  RUNNING
  SUCCEEDED
  FAILED
}

enum SignalType {
  ENTRY_OK          // エントリー可能（旧 READY は廃止）
  LOCKED_EVENT      // 指標前後ロック
  LOCKED_FORCE      // 強制ロック
  COOLDOWN          // クールダウン発動
  BREAKOUT          // ブレイクアウト検出
  PATTERN_DETECTED  // チャートパターン検出
}

enum ImportanceLevel {
  LOW
  MEDIUM
  HIGH
  CRITICAL
}

// ══════════════════════════════════════════
// 認証 / ユーザー
// ══════════════════════════════════════════

model User {
  id           String     @id @default(uuid())
  email        String     @unique
  passwordHash String     @map("password_hash")
  role         UserRole   @default(FREE)
  status       UserStatus @default(ACTIVE)
  createdAt    DateTime   @default(now()) @map("created_at")
  updatedAt    DateTime   @updatedAt      @map("updated_at")
  lastLoginAt  DateTime?                  @map("last_login_at")

  // relations
  sessions        Session[]
  settings        UserSetting?
  symbolSettings  SymbolSetting[]
  trades          Trade[]
  snapshots       Snapshot[]
  signals         Signal[]
  predictionJobs  PredictionJob[]
  auditLogs       AuditLog[]

  @@map("users")
}

model Session {
  id               String    @id @default(uuid())
  userId           String    @map("user_id")
  refreshTokenHash String    @map("refresh_token_hash")
  userAgent        String?   @map("user_agent")
  ipAddress        String?   @map("ip_address")
  expiresAt        DateTime  @map("expires_at")
  revokedAt        DateTime? @map("revoked_at")
  createdAt        DateTime  @default(now()) @map("created_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([expiresAt])  // cleanup ジョブで使用
  @@map("sessions")
}

// ══════════════════════════════════════════
// 設定
// ══════════════════════════════════════════

model UserSetting {
  id             String   @id @default(uuid())
  userId         String   @unique @map("user_id")
  preset         Preset   @default(standard)
  // preset 選択時に下記フィールドが初期値に上書きされる
  // ユーザーが個別変更した場合はそちらが優先
  scoreThreshold Int      @default(75) @map("score_threshold")

  // riskProfile 構造:
  // {
  //   maxRiskPct:      number  // 1トレード最大リスク率(%)
  //   maxDailyLossPct: number  // 1日最大損失率(%)
  //   maxStreak:       number  // 最大連敗数（超えたらCOOLDOWN）
  //   cooldownMin:     number  // 冷却時間（分）
  //   maxTrades:       number  // 1日最大トレード数
  //   atrMultiplier:   number  // ATRベースSL係数
  // }
  riskProfile Json @default("{}") @map("risk_profile")

  // uiPrefs 構造:
  // {
  //   theme:            "dark" | "light"
  //   mode:             "beginner" | "pro"
  //   defaultSymbol:    string   // 例: "EURUSD"
  //   defaultTimeframe: Timeframe
  // }
  uiPrefs Json @default("{}") @map("ui_prefs")

  // featureSwitches 構造:
  // {
  //   aiSignal:       boolean  // AIシグナル表示
  //   patternBonus:   boolean  // パターンボーナス加算
  //   newsLock:       boolean  // ニュース前ロック
  //   cooldownTimer:  boolean  // 冷却タイマー有効
  //   mtfPrediction:  boolean  // MTF予測機能表示
  // }
  featureSwitches Json    @default("{}") @map("feature_switches")
  forceLock       Boolean @default(false) @map("force_lock")
  updatedAt       DateTime @updatedAt @map("updated_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("user_settings")
}

model SymbolSetting {
  id               String    @id @default(uuid())
  userId           String    @map("user_id")
  symbol           String    // 例: "EURUSD", "USDJPY"
  enabled          Boolean   @default(true)
  defaultTimeframe Timeframe @default(H4) @map("default_timeframe")
  // null の場合は UserSetting.scoreThreshold を使用
  // 許容範囲は 50〜100。DB CHECK 制約は v5.1 では任意。正本バリデーションは Zod Schema。
  customThreshold  Int?      @map("custom_threshold")
  createdAt        DateTime  @default(now()) @map("created_at")
  updatedAt        DateTime  @updatedAt      @map("updated_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, symbol])
  @@map("symbol_settings")
}

// ══════════════════════════════════════════
// トレード記録
// ══════════════════════════════════════════

model Trade {
  id          String      @id @default(uuid())
  userId      String      @map("user_id")
  symbol      String
  side        TradeSide
  entryTime   DateTime    @map("entry_time")
  entryPrice  Decimal     @map("entry_price") @db.Decimal(10, 5)
  exitTime    DateTime?   @map("exit_time")
  exitPrice   Decimal?    @map("exit_price")  @db.Decimal(10, 5)
  size        Decimal     @db.Decimal(10, 4)  // lot 数
  sl          Decimal?    @db.Decimal(10, 5)  // Stop Loss 価格
  tp          Decimal?    @db.Decimal(10, 5)  // Take Profit 価格
  pnl         Decimal?    @db.Decimal(12, 2)  // 円建て損益
  pips        Decimal?    @db.Decimal(8, 1)   // pips 損益
  status      TradeStatus @default(OPEN)
  tags        String[]    @default([])
  note        String?
  createdAt   DateTime    @default(now()) @map("created_at")
  updatedAt   DateTime    @updatedAt      @map("updated_at")

  user   User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  review TradeReview?

  @@index([userId, status])
  @@index([userId, symbol])
  @@index([userId, entryTime])
  @@map("trades")
}

model TradeReview {
  id           String   @id @default(uuid())
  tradeId      String   @unique @map("trade_id")
  scoreAtEntry Int      @map("score_at_entry")

  // ruleChecks 構造:
  // {
  //   scoreOk:    boolean
  //   riskOk:     boolean
  //   eventLock:  boolean  // false = ロック解除済み
  //   cooldown:   boolean  // false = クールダウンなし
  //   patterns:   string[] // 検出されたパターン名
  //   entryState: EntryState
  // }
  ruleChecks Json @map("rule_checks")

  // psychology 構造:
  // {
  //   emotion:       string   // 例: "冷静", "焦り", "リベンジ"
  //   selfNote:      string   // 自由記述
  //   biasDetected:  string[] // 例: ["FOMO", "損失回避"]
  // }
  psychology  Json     @default("{}") @map("psychology")
  disciplined Boolean  // true = ルール遵守でエントリーした
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt      @map("updated_at")

  trade Trade @relation(fields: [tradeId], references: [id], onDelete: Cascade)

  @@map("trade_reviews")
}

// ══════════════════════════════════════════
// スナップショット / スコア
// ══════════════════════════════════════════

model Snapshot {
  id         String    @id @default(uuid())
  userId     String    @map("user_id")
  symbol     String
  timeframe  Timeframe
  capturedAt DateTime  @map("captured_at")
  // capturedAt は snapshot-capture ジョブが必ずセットする（default なし・明示投入前提）

  // indicators 構造:
  // {
  //   ma:   { ma50: number, ma200: number, slope: number, crossStatus: "GC"|"DC"|"NONE" }
  //   rsi:  { value: number, divergence: boolean }
  //   macd: { macdLine: number, signal: number, histogram: number, crossStatus: "GC"|"DC"|"NONE" }
  //   bb:   { upper: number, mid: number, lower: number, bandwidth: number }
  //   atr:  { value: number, ratio: number }  // ratio = 現在ATR / 30本平均ATR
  // }
  indicators Json

  // patterns 配列要素:
  // { name: string, direction: "BUY"|"SELL", confidence: number, bonus: number }
  patterns Json @default("[]")

  // mtfAlignment 構造:
  // { W1: { score: number, direction: "BUY"|"SELL"|"NEUTRAL" }, D1: {...}, H4: {...}, ... }
  mtfAlignment Json @default("{}") @map("mtf_alignment")

  scoreTotal     Int        @map("score_total")

  // scoreBreakdown 構造:
  // { technical: number, fundamental: number, market: number, rr: number, patternBonus: number }
  scoreBreakdown Json @map("score_breakdown")

  entryState EntryState @map("entry_state")

  // entryContext 構造（EntryDecision の入力値を保存 → 後から再現可能）:
  // { rr: number, lotSize: number, isEventWindow: boolean, isCooldown: boolean, forceLock: boolean }
  entryContext Json @map("entry_context")

  createdAt DateTime @default(now()) @map("created_at")

  user    User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  signals Signal[]

  @@index([userId, symbol, capturedAt])
  @@index([userId, entryState])
  @@map("snapshots")
}

model Signal {
  id          String     @id @default(uuid())
  userId      String     @map("user_id")
  symbol      String
  timeframe   Timeframe
  snapshotId  String     @map("snapshot_id")
  triggeredAt DateTime   @map("triggered_at")
  type        SignalType

  // metadata 構造（SignalType 別に異なる）:
  // ENTRY_OK:          { score: number, patterns: string[] }
  // LOCKED_EVENT:     { eventName: string, minutesUntil: number }
  // PATTERN_DETECTED: { patternName: string, confidence: number, bonus: number }
  metadata       Json     @default("{}")
  acknowledgedAt DateTime? @map("acknowledged_at")
  createdAt      DateTime  @default(now()) @map("created_at")

  user     User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  snapshot Snapshot @relation(fields: [snapshotId], references: [id], onDelete: Cascade)

  @@index([userId, acknowledgedAt])
  @@index([userId, triggeredAt])
  @@map("signals")
}

// ══════════════════════════════════════════
// MTF 予測（v5.1 = スタブ実装）
// ══════════════════════════════════════════
// v5.1 では固定値（STUB_PREDICTION_RESULT）を返すのみ。
// DTW / HMM / 類似検索 / 重み自動学習は v6 設計資料扱い。

model PredictionJob {
  id           String    @id @default(uuid())
  userId       String    @map("user_id")
  symbol       String
  timeframe    Timeframe

  // requestData 構造（v5.1 はジョブ受付・状態管理のみ）:
  // { symbol: string, timeframe: Timeframe }
  requestData Json      @map("request_data")

  status       JobStatus @default(QUEUED)
  startedAt    DateTime? @map("started_at")
  finishedAt   DateTime? @map("finished_at")
  errorMessage String?   @map("error_message")
  createdAt    DateTime  @default(now()) @map("created_at")

  user   User               @relation(fields: [userId], references: [id], onDelete: Cascade)
  result PredictionResult?

  @@index([userId, status])
  @@index([userId, createdAt])
  @@map("prediction_jobs")
}

model PredictionResult {
  id        String   @id @default(uuid())
  jobId     String   @unique @map("job_id")

  // resultData 構造（v5.1 = STUB_PREDICTION_RESULT 固定値 / Part 8 §9.3 準拠）:
  // {
  //   scenarios: {
  //     bull:    { probability: 0.42, target: '+0.8%', horizonBars: 12 },
  //     neutral: { probability: 0.33, target: '+0.1%', horizonBars: 12 },
  //     bear:    { probability: 0.25, target: '-0.5%', horizonBars: 12 },
  //   },
  //   stats: {
  //     matchedCases: 0,          // stub 固定値（実計算は v6）
  //     confidence:   0.55,       // stub 固定値
  //     note:         'v5.1 STUB result',
  //   },
  //   tfWeights: null,            // v6 で本実装
  //   hmmState:  null,            // v6 で本実装
  // }
  // ※ DB保存 / API返却 / フロント表示はすべてこの shape に統一する。
  // ※ matchedCases 詳細配列・pValue・sharpeRatio は v6 実装対象。
  resultData Json    @map("result_data")
  createdAt  DateTime @default(now()) @map("created_at")

  job PredictionJob @relation(fields: [jobId], references: [id], onDelete: Cascade)

  @@map("prediction_results")
}

// ══════════════════════════════════════════
// 共有マスタ（ユーザー非依存）
// ══════════════════════════════════════════

model InterestRate {
  id          String   @id @default(uuid())
  country     String   // 例: "US", "EU", "JP", "GB"
  bank        String   // 例: "FRB", "ECB", "BOJ", "BOE"
  currency    String   // 例: "USD", "EUR", "JPY", "GBP"
  rate        Decimal  @db.Decimal(5, 3)  // 例: 5.250
  effectiveAt DateTime @map("effective_at")
  createdAt   DateTime @default(now()) @map("created_at")

  @@index([currency, effectiveAt])
  @@map("interest_rates")
}

model EconomicEvent {
  id          String          @id @default(uuid())
  title       String
  country     String
  currency    String
  scheduledAt DateTime        @map("scheduled_at")
  importance  ImportanceLevel
  actual      Decimal?        @db.Decimal(10, 4)
  forecast    Decimal?        @db.Decimal(10, 4)
  previous    Decimal?        @db.Decimal(10, 4)
  // deviation = actual - forecast（取得時に計算して保存）
  deviation   Decimal?        @db.Decimal(10, 4)
  source      String?         // データ提供元: "FRED", "STOOQ" など
  createdAt   DateTime        @default(now()) @map("created_at")
  updatedAt   DateTime        @updatedAt      @map("updated_at")

  @@index([scheduledAt, importance])
  @@index([currency, scheduledAt])
  @@map("economic_events")
}

// ══════════════════════════════════════════
// 監査ログ
// ══════════════════════════════════════════

model AuditLog {
  id         String   @id @default(uuid())
  userId     String?  @map("user_id")  // null = システム操作
  // action 命名規則: "<resource>.<verb>" 例: "trade.create", "settings.update", "auth.login"
  action     String
  targetType String?  @map("target_type")  // 例: "Trade", "UserSetting"
  targetId   String?  @map("target_id")
  // metadata: 変更前後の値など（PII は含めない）
  metadata   Json     @default("{}")
  ipAddress  String?  @map("ip_address")
  createdAt  DateTime @default(now()) @map("created_at")

  user User? @relation(fields: [userId], references: [id], onDelete: SetNull)

  @@index([userId, createdAt])
  @@index([action, createdAt])
  @@map("audit_logs")
}

// ══════════════════════════════════════════
// Chart 専用テーブル — 定義は Part 11 を参照
// ══════════════════════════════════════════
// PG-07 Chart ページ専用の以下 4 テーブルは
// Part 11（SPEC_v51_part11_chart_api.md）を正本とする。
// market_candles    : ローソク足 OHLCV キャッシュ
// indicator_cache   : インジケーター計算結果キャッシュ
// pattern_detections: チャートパターン検出ログ
// chart_snapshots   : チャート状態スナップショット
// Part 11 が未作成の場合、Chart 専用テーブルの実装は保留とし
// コアテーブルのみで代替する。
```

---

## 3. テーブル設計の判断根拠

| 設計判断 | 理由 |
|---------|------|
| OHLC データを snapshots に格納しない | キャンドルデータは大量かつ API から都度取得する。snapshots は「計算済みスコア結果」の保持に限定し肥大化を防ぐ |
| riskProfile / uiPrefs / featureSwitches を JSONB 型にした | 項目の増減が頻繁なUI設定を固定カラムで管理すると migration コストが高い。バリデーションはアプリ層（packages/types の Zod Schema を正本とし、NestJS 側は createZodDto() 派生）で実施 |
| TradeReview を Trade から分離 | 振り返りは取引後に追記されるため作成タイミングが異なる。null チェックで「レビュー済み / 未済」が分かる |
| InterestRate を別テーブルで履歴管理 | 政策金利は変更頻度が低いが変更履歴も保持したい。effectiveAt で時点検索が可能 |
| EconomicEvent を共有マスタにした | ユーザー固有ではなく全ユーザー共通のデータ。ジョブが一括取得して保存する |
| Snapshot.entryContext を JSONB で保存 | EntryDecision の入力値を保存しておくと、後から「なぜそのスコアだったか」の完全な再現が可能になる |
| Signal.acknowledgedAt を nullable にした | null = 未確認、非 null = 確認済み。INDEX を張ることで「未確認シグナル一覧」が高速に取得できる |
| PredictionResult.resultData を JSONB にした | v5.1 はスタブ固定値を格納する。v6 以降で予測結果の構造が変わっても、スキーマ変更なしに対応できる |
| 物理削除は行わない方針 | Trade は status=CANCELED / Session は revokedAt / User は status=SUSPENDED。監査証跡を保持する |
| plans / subscriptions テーブルは v5.1 に存在しない | 課金・Stripe 連携は v7 対象。v5.1 では UserRole enum でプラン制御を完結させる |
| Chart 専用テーブルを本 Schema に含めない | market_candles / indicator_cache / pattern_detections / chart_snapshots の定義は Part 11 を正本とし、コアテーブルと役割を明確に分離する |

---

## 4. Prisma マイグレーション運用ルール

```bash
# 開発環境 — スキーマ変更時
npx prisma migrate dev --name <変更内容を簡潔に>
# 例: npx prisma migrate dev --name add_prediction_results

# 本番環境（v6 以降）
npx prisma migrate deploy

# Prisma Client 再生成
npx prisma generate

# DB の現状確認
npx prisma studio  # ブラウザ GUI
```

**マイグレーションの命名規則**

```
<動詞>_<対象テーブル>_<変更内容>
例:
  add_users_last_login_at
  alter_snapshots_add_mtf_alignment
  create_prediction_results
```

---

## 5. インデックス設計まとめ

| テーブル | インデックス | 用途 |
|---------|------------|------|
| sessions | (user_id), (expires_at) | セッション検索 / cleanup ジョブ |
| symbol_settings | UNIQUE(user_id, symbol) | ペア設定の重複防止 |
| trades | (user_id, status), (user_id, symbol), (user_id, entry_time) | 条件付き一覧取得 |
| snapshots | (user_id, symbol, captured_at), (user_id, entry_state) | 時系列取得 / 状態フィルター |
| signals | (user_id, acknowledged_at), (user_id, triggered_at) | 未確認一覧 / 時系列 |
| prediction_jobs | (user_id, status), (user_id, created_at) | ステータス監視 |
| interest_rates | (currency, effective_at) | 通貨別最新金利取得 |
| economic_events | (scheduled_at, importance), (currency, scheduled_at) | カレンダー検索 |
| audit_logs | (user_id, created_at), (action, created_at) | 監査検索 |
| market_candles | Part 11 参照 | ローソク足キャッシュ検索（PG-07 用）|
| indicator_cache | Part 11 参照 | インジケーター結果検索（PG-07 用）|
| pattern_detections | Part 11 参照 | パターン検出ログ検索（PG-07 用）|
| chart_snapshots | Part 11 参照 | チャート状態検索（PG-07 用）|

---

## 6. DB テーブル一覧（確定）

### 6.1 v5.1 基本テーブル一覧（Part10 §7.1 コアテーブル + 共有マスタ + 監査）

| テーブル名 | 説明 |
|-----------|------|
| `users` | ユーザー（認証・ロール）|
| `sessions` | リフレッシュトークン管理 |
| `user_settings` | ユーザー設定・プリセット |
| `symbol_settings` | ユーザー別シンボル設定 |
| `trades` | トレード記録 |
| `trade_reviews` | 振り返り・心理分析 |
| `snapshots` | スコアスナップショット |
| `signals` | シグナル記録 |
| `prediction_jobs` | 予測ジョブ管理（v5.1 = スタブ）|
| `prediction_results` | 予測結果（v5.1 = stub 固定値）|
| `interest_rates` | 政策金利マスタ（共有）|
| `economic_events` | 経済指標カレンダー（共有）|
| `audit_logs` | 監査ログ |

> **`plans` / `subscriptions` テーブルは v5.1 に存在しない。**
> 課金・Stripe 連携は v7 対象。v5.1 では `UserRole` enum で制御する。

### 6.2 Chart 専用テーブル（Part 11 正本 / PG-07 用）

PG-07 Chart ページの専用テーブルは **Part 11（SPEC_v51_part11_chart_api.md）を正本** とする。
本節はその存在と役割のみ記録する。

| テーブル名 | 役割 | 正本 |
|-----------|------|------|
| `market_candles` | ローソク足 OHLCV キャッシュ | Part 11 |
| `indicator_cache` | インジケーター計算結果キャッシュ | Part 11 |
| `pattern_detections` | チャートパターン検出ログ | Part 11 |
| `chart_snapshots` | チャート状態スナップショット | Part 11 |

> Part 10 §7.1 のコアテーブルと Part 11 §6.2 の Chart 専用テーブルは役割が異なる。
> Claude が PG-07 を実装する際は必ず Part 11 の DB 定義を参照すること。
> Part 11 が未作成の場合、Chart 専用テーブルの実装は保留とし、コアテーブルのみで代替する。

---

*Part 2 完了 — 次: Part 3 → API 設計（エンドポイント · DTO · バリデーション）*
