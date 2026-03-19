# FX Discipline Engine — 統合仕様書 v5.1
## SPEC-v5.1 / Part 3 : API 設計（エンドポイント · DTO · バリデーション）

> ### 権限表記ルール（v5.1 確定）
> 権限は必ず具体的なロール名を列挙して記載すること。
>
> **許可する表現（例）:**
> - `FREE` / `BASIC` / `PRO` / `PRO_PLUS` / `ADMIN`（個別ロール）
> - `PRO | PRO_PLUS | ADMIN`（複数ロールの具体列挙）
> - `全ロール`（全員アクセス可を明示する場合のみ）
>
> **禁止する表現（これらを書いたら誤り）:**
> - `PRO 以上`（**この表現は禁止**。ロール数が変わると意味が崩れる）
> - `有料ユーザー` / `上位プラン` / その他の曖昧な総称
>
> **本 Part のすべての権限表記はこのルールに従っている。**

---

## 1. API 設計方針

> ### DTO 実装規則（Zod Schema 派生）
>
> Part 3 の DTO コード例は仕様を示すための擬似コードである。実際の DTO ファイルは以下の手順で派生させること。
>
> **Step 1 — Zod Schema 定義**
> `packages/types/src/schemas/<resource>.schema.ts` に Zod Schema を定義する。
>
> ```typescript
> // packages/types/src/schemas/trade.schema.ts
> import { z } from 'zod';
> export const CreateTradeSchema = z.object({
>   symbol: z.string().min(1),
>   side:   z.enum(['BUY', 'SELL']),
>   // ...
> });
> export type CreateTradeDto = z.infer<typeof CreateTradeSchema>;
> ```
>
> **Step 2 — NestJS DTO 派生**
> `apps/api` の各モジュールで `createZodDto()` を使い、Zod Schema から DTO クラスを派生させる。
>
> ```typescript
> // apps/api/src/trades/dto/create-trade.dto.ts
> import { createZodDto } from 'nestjs-zod';
> import { CreateTradeSchema } from '@fxde/types/schemas/trade.schema';
> export class CreateTradeDto extends createZodDto(CreateTradeSchema) {}
> ```
>
> **禁止事項**: `class-validator` デコレータ（`@IsEmail()` 等）を手書きしない。
> バリデーションロジックは Zod Schema 側に集約し、DTO は派生のみとする。
>
> **DTO コード例中のアノテーション表記規則**:
> 擬似コードに記載された `// [CV→Zod] @IsEmail()` 等のコメントは、
> 対応する Zod バリデーションを示すヒントである。実装時は Zod の等価表現に置き換えること。

| 項目 | 方針 |
|------|------|
| 形式 | REST / JSON |
| ベース URL | `/api/v1` |
| 認証 | Bearer Token（AccessToken）/ HttpOnly Cookie（RefreshToken）|
| エラー形式 | `{ statusCode, message, error, timestamp, path }` 統一 |
| レスポンス形式 | 単一リソース: オブジェクト / 一覧: `{ data: [], total, page, limit }` |
| API 仕様書 | Swagger UI: `/api/docs`（開発環境のみ公開）|
| バージョニング | URI バージョニング（`/api/v1/...`）|

---

## 2. 共通型定義（packages/types）

```typescript
// packages/types/src/api.ts

// ── ページネーション ──
export interface PaginationQuery {
  page?: number;    // default: 1
  limit?: number;   // default: 20, max: 100
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

// ── 共通エラーレスポンス ──
export interface ErrorResponse {
  statusCode: number;
  message: string | string[];
  error: string;
  timestamp: string;
  path: string;
}

// ── 共通成功レスポンス ──
export interface SuccessResponse {
  success: true;
  message?: string;
}
```

---

## 3. Auth API

### エンドポイント一覧

| Method | Path | 認証 | 権限 | 説明 |
|--------|------|------|------|------|
| POST | `/api/v1/auth/register` | 不要 | — | ユーザー登録 |
| POST | `/api/v1/auth/login` | 不要 | — | ログイン |
| POST | `/api/v1/auth/refresh` | RT Cookie | 全ロール | AccessToken 再発行 |
| POST | `/api/v1/auth/logout` | AT | 全ロール | ログアウト（セッション無効化）|

### DTO

```typescript
// ⚠️ 以下は擬似コード（参考）。実際の実装は Zod Schema + createZodDto を使うこと。
// 実装方法: packages/types/src/schemas/ に Zod Schema を定義し、
//            apps/api で createZodDto(Schema) を使って DTO を派生させる。
//
// apps/api/src/auth/dto/register.dto.ts
export class RegisterDto {
  // [CV→Zod] @IsEmail()
  email: string;

  // [CV→Zod] @IsString()
  // [CV→Zod] @MinLength(12)
  // [CV→Zod] @MaxLength(72)
  // [CV→Zod] @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
  //   message: 'パスワードは英大文字・小文字・数字を各1文字以上含めてください'
  password: string;
}

// apps/api/src/auth/dto/login.dto.ts
export class LoginDto {
  // [CV→Zod] @IsEmail()
  email: string;

  // [CV→Zod] @IsString()
  // [CV→Zod] @MinLength(1)
  password: string;
}
```

### レスポンス仕様

```typescript
// POST /auth/register → 201
// POST /auth/login    → 200
interface AuthResponse {
  accessToken: string;
  user: {
    id: string;
    email: string;
    role: 'FREE' | 'BASIC' | 'PRO' | 'PRO_PLUS' | 'ADMIN';
  };
}
// RefreshToken は Set-Cookie ヘッダーで返す（HttpOnly; Secure; SameSite=Strict）

// POST /auth/refresh → 200
interface RefreshResponse {
  accessToken: string;
}

// POST /auth/logout → 200
// Cookie を無効化（Max-Age=0）し、DB の Session.revokedAt を更新
interface LogoutResponse {
  success: true;
}
```

---

## 4. Users API

| Method | Path | 認証 | 権限 | 説明 |
|--------|------|------|------|------|
| GET | `/api/v1/users/me` | AT | 全ロール | 自分のプロフィール取得 |
| PATCH | `/api/v1/users/me` | AT | 全ロール | プロフィール部分更新 |

```typescript
// GET /users/me → 200
interface UserMeResponse {
  id: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  lastLoginAt: string | null;
}

// ⚠️ 以下は擬似コード（参考）。実際の実装は Zod Schema + createZodDto を使うこと。
// PATCH /users/me DTO
export class UpdateUserDto {
  // [CV→Zod] @IsOptional() @IsEmail()
  email?: string;

  // [CV→Zod] @IsOptional() @IsString() @MinLength(12) @MaxLength(72)
  // [CV→Zod] @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
  password?: string;
}

// PATCH /users/me → 200
// 更新後の UserMeResponse を返す
```

---

## 5. Settings API

| Method | Path | 認証 | 権限 | 説明 |
|--------|------|------|------|------|
| GET | `/api/v1/settings` | AT | 全ロール | 自分の設定取得 |
| PATCH | `/api/v1/settings` | AT | 全ロール | 設定の部分更新 |
| PATCH | `/api/v1/settings/preset` | AT | 全ロール | プリセット適用（閾値・リスク値を自動上書き）|

```typescript
// ⚠️ 以下は擬似コード（参考）。実際の実装は Zod Schema + createZodDto を使うこと。
// 実装方法: packages/types/src/schemas/ に Zod Schema を定義し、
//            apps/api で createZodDto(Schema) を使って DTO を派生させる。
//
// apps/api/src/settings/dto/update-settings.dto.ts
export class UpdateSettingsDto {
  // [CV→Zod] @IsOptional() @IsEnum(Preset)
  preset?: Preset;

  // [CV→Zod] @IsOptional() @IsInt() @Min(50) @Max(100)
  scoreThreshold?: number;

  // [CV→Zod] @IsOptional() @IsObject()
  riskProfile?: RiskProfileDto;

  // [CV→Zod] @IsOptional() @IsObject()
  uiPrefs?: UiPrefsDto;

  // [CV→Zod] @IsOptional() @IsObject()
  featureSwitches?: FeatureSwitchesDto;

  // [CV→Zod] @IsOptional() @IsBoolean()
  forceLock?: boolean;
}

export class RiskProfileDto {
  // [CV→Zod] @IsOptional() @IsNumber() @Min(0.1) @Max(5.0)
  maxRiskPct?: number;

  // [CV→Zod] @IsOptional() @IsNumber() @Min(0.5) @Max(20.0)
  maxDailyLossPct?: number;

  // [CV→Zod] @IsOptional() @IsInt() @Min(1) @Max(10)
  maxStreak?: number;

  // [CV→Zod] @IsOptional() @IsInt() @Min(5) @Max(480)
  cooldownMin?: number;

  // [CV→Zod] @IsOptional() @IsInt() @Min(1) @Max(20)
  maxTrades?: number;

  // [CV→Zod] @IsOptional() @IsNumber() @Min(0.5) @Max(5.0)
  atrMultiplier?: number;
}

export class UiPrefsDto {
  // [CV→Zod] @IsOptional() @IsIn(['dark', 'light'])
  theme?: string;

  // [CV→Zod] @IsOptional() @IsIn(['beginner', 'pro'])
  mode?: string;

  // [CV→Zod] @IsOptional() @IsString()
  defaultSymbol?: string;

  // [CV→Zod] @IsOptional() @IsEnum(Timeframe)
  defaultTimeframe?: Timeframe;
}

export class FeatureSwitchesDto {
  // [CV→Zod] @IsOptional() @IsBoolean() aiSignal?: boolean;
  // [CV→Zod] @IsOptional() @IsBoolean() patternBonus?: boolean;
  // [CV→Zod] @IsOptional() @IsBoolean() newsLock?: boolean;
  // [CV→Zod] @IsOptional() @IsBoolean() cooldownTimer?: boolean;
  // [CV→Zod] @IsOptional() @IsBoolean() mtfPrediction?: boolean;
}

// PATCH /settings/preset → 200
export class ApplyPresetDto {
  // [CV→Zod] @IsEnum(Preset)
  preset: Preset;
}
```

**プリセット適用時の初期値（サーバー側で固定）**

```typescript
// apps/api/src/settings/preset.constants.ts
export const PRESET_DEFAULTS: Record<Preset, Partial<RiskProfile>> = {
  conservative: { maxRiskPct: 0.5, maxDailyLossPct: 1.5, maxStreak: 2, cooldownMin: 60, maxTrades: 2, atrMultiplier: 1.5 },
  standard:     { maxRiskPct: 1.0, maxDailyLossPct: 3.0, maxStreak: 3, cooldownMin: 30, maxTrades: 3, atrMultiplier: 1.5 },
  aggressive:   { maxRiskPct: 2.0, maxDailyLossPct: 6.0, maxStreak: 5, cooldownMin: 15, maxTrades: 5, atrMultiplier: 2.0 },
};

export const PRESET_THRESHOLDS: Record<Preset, number> = {
  conservative: 85,
  standard:     75,
  aggressive:   70,
};
```

---

## 6. Symbols API

| Method | Path | 認証 | 権限 | 説明 |
|--------|------|------|------|------|
| GET | `/api/v1/symbols` | AT | 全ロール | ペア設定一覧（システム定義 + ユーザー設定）|
| PATCH | `/api/v1/symbols/:symbol` | AT | 全ロール | ペア個別設定の部分更新 |

```typescript
// ⚠️ 以下は擬似コード（参考）。実際の実装は Zod Schema + createZodDto を使うこと。
// 実装方法: packages/types/src/schemas/ に Zod Schema を定義し、
//            apps/api で createZodDto(Schema) を使って DTO を派生させる。
//
// システム定義通貨ペア（config から返す）
// "EURUSD" | "USDJPY" | "GBPUSD" | "USDCHF"
// | "AUDUSD" | "NZDUSD" | "USDCAD" | "XAUUSD"

// PATCH /symbols/:symbol DTO
export class UpdateSymbolSettingDto {
  // [CV→Zod] @IsOptional() @IsBoolean()
  enabled?: boolean;

  // [CV→Zod] @IsOptional() @IsEnum(Timeframe)
  defaultTimeframe?: Timeframe;

  // [CV→Zod] @IsOptional() @IsInt() @Min(50) @Max(100)
  customThreshold?: number | null; // null で UserSetting の閾値に戻す
}
```

---

## 7. Snapshots API（スコア計算）

| Method | Path | 認証 | 権限 | 説明 |
|--------|------|------|------|------|
| POST | `/api/v1/snapshots/capture` | AT | 全ロール | スコア計算 + 保存 |
| GET | `/api/v1/snapshots` | AT | 全ロール | スナップショット一覧 |
| GET | `/api/v1/snapshots/:id` | AT | 全ロール | スナップショット詳細 |
| POST | `/api/v1/snapshots/evaluate` | AT | 全ロール | 保存なしのスコア評価のみ |

```typescript
// ⚠️ 以下は擬似コード（参考）。実際の実装は Zod Schema + createZodDto を使うこと。
// 実装方法: packages/types/src/schemas/ に Zod Schema を定義し、
//            apps/api で createZodDto(Schema) を使って DTO を派生させる。
//
// POST /snapshots/capture DTO
export class CaptureSnapshotDto {
  // [CV→Zod] @IsString() @IsNotEmpty()
  symbol: string; // 例: "EURUSD"

  // [CV→Zod] @IsEnum(Timeframe)
  timeframe: Timeframe;

  // 省略時はコネクタから最新データを取得
  // 指定時はそのデータで計算（バックテスト用途）
  // [CV→Zod] @IsOptional() @IsDateString()
  asOf?: string;
}

// POST /snapshots/capture → 201
interface SnapshotResponse {
  id: string;
  symbol: string;
  timeframe: Timeframe;
  capturedAt: string;
  scoreTotal: number;
  scoreBreakdown: {
    technical: number;
    fundamental: number;
    market: number;
    rr: number;
    patternBonus: number;
  };
  entryState: EntryState;
  entryDecision: {
    status: EntryState;
    reasons: string[];    // 例: ["スコア72点 / 基準75点まで待機"]
    recommendation: string; // 例: "待機：あと3点でエントリー可能になります"
  };
  indicators: IndicatorsData;
  patterns: PatternData[];
  mtfAlignment: MtfAlignmentData;
}

// GET /snapshots クエリパラメータ
export class GetSnapshotsQueryDto extends PaginationQuery {
  // [CV→Zod] @IsOptional() @IsString()
  symbol?: string;

  // [CV→Zod] @IsOptional() @IsEnum(Timeframe)
  timeframe?: Timeframe;

  // [CV→Zod] @IsOptional() @IsEnum(EntryState)
  entryState?: EntryState;

  // [CV→Zod] @IsOptional() @IsDateString()
  from?: string;

  // [CV→Zod] @IsOptional() @IsDateString()
  to?: string;
}
```

---

## 7a. Chart API（PG-07）

> チャート表示に特化したスナップショット取得と、チャート上への注記（ノート）管理を提供する。
> ノートはユーザー個人のメモとして DB に保存する。

| Method | Path | 認証 | 権限 | 説明 |
|--------|------|------|------|------|
| GET | `/api/v1/chart/snapshot` | AT | 全ロール | チャート表示用スナップショット取得 |
| POST | `/api/v1/chart/note` | AT | 全ロール | チャートノート作成 |
| GET | `/api/v1/chart/notes` | AT | 全ロール | チャートノート一覧取得 |

```typescript
// ⚠️ 以下は擬似コード（参考）。実際の実装は Zod Schema + createZodDto を使うこと。
// 実装方法: packages/types/src/schemas/ に Zod Schema を定義し、
//            apps/api で createZodDto(Schema) を使って DTO を派生させる。

// GET /chart/snapshot クエリパラメータ
export class GetChartSnapshotQueryDto {
  // [CV→Zod] @IsString() @IsNotEmpty()
  symbol: string; // 例: "EURUSD"

  // [CV→Zod] @IsEnum(Timeframe)
  timeframe: Timeframe;
}

// GET /chart/snapshot → 200
// 指定ペア・時間足の最新スナップショットをチャート描画向けに返す。
// 最新のスナップショットが存在しない場合は 404 を返す。
interface ChartSnapshotResponse {
  snapshotId: string;
  symbol: string;
  timeframe: Timeframe;
  capturedAt: string;
  scoreTotal: number;
  entryState: EntryState;
  indicators: IndicatorsData;
  patterns: PatternData[];
  mtfAlignment: MtfAlignmentData;
}

// POST /chart/note DTO
export class CreateChartNoteDto {
  // [CV→Zod] @IsString() @IsNotEmpty()
  symbol: string;

  // [CV→Zod] @IsEnum(Timeframe)
  timeframe: Timeframe;

  // [CV→Zod] @IsString() @IsNotEmpty() @MaxLength(500)
  content: string;

  // チャート上の時点（省略時はサーバー受信時刻）
  // [CV→Zod] @IsOptional() @IsDateString()
  noteAt?: string;
}

// POST /chart/note → 201
interface ChartNoteResponse {
  id: string;
  symbol: string;
  timeframe: Timeframe;
  content: string;
  noteAt: string;
  createdAt: string;
}

// GET /chart/notes クエリパラメータ
export class GetChartNotesQueryDto extends PaginationQuery {
  // [CV→Zod] @IsString() @IsNotEmpty()
  symbol: string;

  // [CV→Zod] @IsEnum(Timeframe)
  timeframe: Timeframe;

  // [CV→Zod] @IsOptional() @IsDateString()
  from?: string;

  // [CV→Zod] @IsOptional() @IsDateString()
  to?: string;
}

// GET /chart/notes → 200
// PaginatedResponse<ChartNoteResponse> 形式で返す
```

---

## 8. Trades API

| Method | Path | 認証 | 権限 | 説明 |
|--------|------|------|------|------|
| POST | `/api/v1/trades` | AT | 全ロール | トレード記録の作成 |
| GET | `/api/v1/trades` | AT | 全ロール | 一覧取得（フィルター・ページネーション）|
| GET | `/api/v1/trades/:id` | AT | 全ロール | 詳細取得 |
| PATCH | `/api/v1/trades/:id` | AT | 全ロール | 部分更新（exitPrice, note 等）|
| POST | `/api/v1/trades/:id/close` | AT | 全ロール | クローズ（exitTime / exitPrice / pnl 確定）|
| DELETE | `/api/v1/trades/:id` | AT | 全ロール | 論理削除（status=CANCELED）|
| POST | `/api/v1/trades/:id/review` | AT | 全ロール | 振り返り登録 |
| GET | `/api/v1/trades/:id/review` | AT | 全ロール | 振り返り取得 |

```typescript
// ⚠️ 以下は擬似コード（参考）。実際の実装は Zod Schema + createZodDto を使うこと。
// 実装方法: packages/types/src/schemas/ に Zod Schema を定義し、
//            apps/api で createZodDto(Schema) を使って DTO を派生させる。
//
// POST /trades DTO
export class CreateTradeDto {
  // [CV→Zod] @IsString() @IsNotEmpty()
  symbol: string;

  // [CV→Zod] @IsEnum(TradeSide)
  side: TradeSide;

  // [CV→Zod] @IsDateString()
  entryTime: string;

  // [CV→Zod] @IsNumber() @IsPositive()
  entryPrice: number;

  // [CV→Zod] @IsNumber() @IsPositive() @Max(100)
  size: number; // lot 数

  // [CV→Zod] @IsOptional() @IsNumber() @IsPositive()
  sl?: number;

  // [CV→Zod] @IsOptional() @IsNumber() @IsPositive()
  tp?: number;

  // [CV→Zod] @IsOptional() @IsArray() @IsString({ each: true })
  tags?: string[];

  // [CV→Zod] @IsOptional() @IsString() @MaxLength(1000)
  note?: string;
}

// PATCH /trades/:id DTO
export class UpdateTradeDto {
  // [CV→Zod] @IsOptional() @IsNumber() @IsPositive()
  sl?: number;

  // [CV→Zod] @IsOptional() @IsNumber() @IsPositive()
  tp?: number;

  // [CV→Zod] @IsOptional() @IsArray() @IsString({ each: true })
  tags?: string[];

  // [CV→Zod] @IsOptional() @IsString() @MaxLength(1000)
  note?: string;
}

// POST /trades/:id/close DTO
export class CloseTradeDto {
  // [CV→Zod] @IsDateString()
  exitTime: string;

  // [CV→Zod] @IsNumber() @IsPositive()
  exitPrice: number;

  // 省略時はサーバー側で自動計算
  // [CV→Zod] @IsOptional() @IsNumber()
  pnl?: number;

  // [CV→Zod] @IsOptional() @IsNumber()
  pips?: number;
}

// GET /trades クエリパラメータ
export class GetTradesQueryDto extends PaginationQuery {
  // [CV→Zod] @IsOptional() @IsString()
  symbol?: string;

  // [CV→Zod] @IsOptional() @IsEnum(TradeStatus)
  status?: TradeStatus;

  // [CV→Zod] @IsOptional() @IsEnum(TradeSide)
  side?: TradeSide;

  // [CV→Zod] @IsOptional() @IsDateString()
  from?: string;

  // [CV→Zod] @IsOptional() @IsDateString()
  to?: string;

  // [CV→Zod] @IsOptional() @IsIn(['entryTime', 'pnl', 'createdAt'])
  sortBy?: string;

  // [CV→Zod] @IsOptional() @IsIn(['asc', 'desc'])
  sortOrder?: string;
}

// POST /trades/:id/review DTO
export class CreateTradeReviewDto {
  // [CV→Zod] @IsInt() @Min(0) @Max(100)
  scoreAtEntry: number;

  // [CV→Zod] @IsObject()
  ruleChecks: RuleChecksDto;

  // [CV→Zod] @IsOptional() @IsObject()
  psychology?: PsychologyDto;

  // [CV→Zod] @IsBoolean()
  disciplined: boolean;
}

export class RuleChecksDto {
  // [CV→Zod] @IsBoolean() scoreOk: boolean;
  // [CV→Zod] @IsBoolean() riskOk: boolean;
  // [CV→Zod] @IsBoolean() eventLock: boolean;
  // [CV→Zod] @IsBoolean() cooldown: boolean;
  // [CV→Zod] @IsArray() @IsString({ each: true }) patterns: string[];
  // [CV→Zod] @IsEnum(EntryState) entryState: EntryState;
}

export class PsychologyDto {
  // [CV→Zod] @IsOptional() @IsString() @MaxLength(50) emotion?: string;
  // [CV→Zod] @IsOptional() @IsString() @MaxLength(500) selfNote?: string;
  // [CV→Zod] @IsOptional() @IsArray() @IsString({ each: true }) biasDetected?: string[];
}
```

---

## 9. Signals API

| Method | Path | 認証 | 権限 | 説明 |
|--------|------|------|------|------|
| GET | `/api/v1/signals` | AT | 全ロール | シグナル一覧 |
| POST | `/api/v1/signals/:id/ack` | AT | 全ロール | シグナル確認済み登録 |

```typescript
// ⚠️ 以下は擬似コード（参考）。実際の実装は Zod Schema + createZodDto を使うこと。
// 実装方法: packages/types/src/schemas/ に Zod Schema を定義し、
//            apps/api で createZodDto(Schema) を使って DTO を派生させる。
//
// GET /signals クエリパラメータ
export class GetSignalsQueryDto extends PaginationQuery {
  // [CV→Zod] @IsOptional() @IsBoolean()
  unacknowledgedOnly?: boolean; // true = 未確認のみ

  // [CV→Zod] @IsOptional() @IsEnum(SignalType)
  type?: SignalType;

  // [CV→Zod] @IsOptional() @IsString()
  symbol?: string;
}

// GET /signals → 200
interface SignalResponse {
  id: string;
  symbol: string;
  timeframe: Timeframe;
  type: SignalType;
  triggeredAt: string;
  acknowledgedAt: string | null;
  metadata: Record<string, unknown>;
  snapshot: {
    id: string;
    scoreTotal: number;
    entryState: EntryState;
  };
}
```

---

## 10. Predictions API（MTF 予測ジョブ）

> **v5.1 実装スコープ**: Prediction Engine は v5.1 においてスタブ実装のみ。
> 固定シナリオデータを返す。DTW / HMM / 類似検索（MatchedCase）/ 統計的有意性検定（pValue）/
> シャープレシオ算出 / tfWeights 自動学習はすべて **v6 設計資料**であり、v5.1 では実装しない。
> 下記 API は v5.1 スタブとして存在し、ジョブの受付・状態管理・固定スタブ結果の返却のみを行う。

| Method | Path | 認証 | 権限 | 説明 |
|--------|------|------|------|------|
| POST | `/api/v1/predictions/jobs` | AT | PRO \| PRO_PLUS \| ADMIN | 予測ジョブ登録 |
| GET | `/api/v1/predictions/jobs/:id` | AT | PRO \| PRO_PLUS \| ADMIN | ジョブ状態確認（5 秒ポーリング）|
| GET | `/api/v1/predictions/latest` | AT | PRO \| PRO_PLUS \| ADMIN | 最新予測結果取得（v5.1 はスタブ）|

```typescript
// ⚠️ 以下は擬似コード（参考）。実際の実装は Zod Schema + createZodDto を使うこと。
// 実装方法: packages/types/src/schemas/ に Zod Schema を定義し、
//            apps/api で createZodDto(Schema) を使って DTO を派生させる。
//
// POST /predictions/jobs DTO（v5.1 スタブ）
// v5.1 では symbol / timeframe のみ受け付ける。
// lookbackYears / minSimilarity / topK は v6 アルゴリズムパラメータのため v5.1 では非対応。
export class CreatePredictionJobDto {
  // [CV→Zod] @IsString() @IsNotEmpty()
  symbol: string;

  // [CV→Zod] @IsEnum(Timeframe)
  timeframe: Timeframe;
}

// POST /predictions/jobs → 202 Accepted
interface CreateJobResponse {
  jobId: string;
  status: 'QUEUED';
  estimatedSeconds: number; // v5.1 スタブでは固定値を返す
}

// GET /predictions/jobs/:id → 200
// ジョブの状態のみ返す（結果は /predictions/latest から取得）
// ⚠️ status は Prisma enum JobStatus と完全一致させること。
//    'DONE' は使用禁止。必ず 'SUCCEEDED' を使う（Part2 / Part8 正本準拠）。
interface JobStatusResponse {
  jobId: string;
  status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  createdAt: string;
  completedAt: string | null;
  errorMessage?: string;
}

// GET /predictions/latest → 200
// v5.1 スタブ: matchedCases / tfWeights / pValue / sharpeRatio は v6 実装項目のため含まない。
//
// ⚠️ shape に関する設計上の決定（Part8 STUB_PREDICTION_RESULT との整合）:
//   - DB / Part8 の STUB_PREDICTION_RESULT は bull / neutral / bear をキーとするオブジェクト型で保存する。
//   - API レスポンスでは、このオブジェクトを PredictionScenario[] 配列に整形して返す。
//   - サービス層で変換責務を持つ。フロントは配列型のみ受け取る。
//   - DB shape と API shape を同一にしない（意図的に分離）。
interface PredictionLatestResponse {
  jobId: string;
  symbol: string;
  timeframe: Timeframe;
  createdAt: string;
  result: {
    // DB の bull/neutral/bear オブジェクトをサービス層で配列に変換して返す
    scenarios: PredictionScenario[];
    stub: true; // v5.1 スタブ結果であることを明示するフラグ
  };
}

// v5.1 スタブで返すシナリオ型
// pricePoints / maxPips / avgTimeHours はスタブ固定値
interface PredictionScenario {
  id: 'bull' | 'neutral' | 'bear';
  label: string;
  probability: number;      // スタブ固定値（例: bull=0.42, neutral=0.33, bear=0.25）
  pricePoints: { bar: number; price: number }[];
  maxPips: number;
  avgTimeHours: number;
}
```

---

## 11. 集計 API（統計・分析系）

> **実装方針**: 全て**都度 SQL 集計 + Redis 1 時間キャッシュ**。事前集計テーブルは作らない。
> キャッシュキー: `stats:{userId}:{endpoint}:{params_hash}`

| Method | Path | 認証 | 権限 | 説明 |
|--------|------|------|------|------|
| GET | `/api/v1/trades/equity-curve` | AT | 全ロール | 損益曲線（period=1M\|3M\|1Y）|
| GET | `/api/v1/trades/stats/summary` | AT | 全ロール | 月次サマリー（勝率・損益・DD）|
| GET | `/api/v1/trades/stats/hourly` | AT | 全ロール | 時間帯別成績 |
| GET | `/api/v1/trades/stats/consecutive-loss` | AT | 全ロール | 連敗後の勝率推移 |
| GET | `/api/v1/trades/stats/by-score-band` | AT | 全ロール | スコア帯別損益 |
| GET | `/api/v1/symbols/correlation` | AT | PRO \| PRO_PLUS \| ADMIN | 通貨ペア相関マトリクス（period=30d\|90d）|
| GET | `/api/v1/predictions/accuracy/timestep` | AT | PRO \| PRO_PLUS \| ADMIN | 予測タイムステップ別精度 |

### レスポンス型

```typescript
// GET /api/v1/trades/equity-curve?period=1M
interface EquityCurveResponse {
  labels: string[]; balance: number[]; drawdown: number[];
  startBalance: number; currentBalance: number;
  totalPnl: number; totalReturnPct: number; mdd: number;
  cachedAt: string; // キャッシュ値の場合に UI でバッジ表示
}

interface TradeSummaryResponse {
  period: string;           // "2025-03"
  totalPnl: number; winRate: number; tradeCount: number;
  maxDd: number; disciplineRate: number;
  warningMessage: string | null; // 規律違反多時に表示
}
```

---

## 12. コネクタ状態 API

> コネクタ状態は **DB に保存しない**。`ConnectorStatusService`（NestJS シングルトン）+ Redis 5 分 TTL で管理。

| Method | Path | 認証 | 権限 | 説明 |
|--------|------|------|------|------|
| GET | `/api/v1/connectors/status` | AT | 全ロール | 全コネクタの接続状態一覧 |
| POST | `/api/v1/connectors/:name/retry` | AT | ADMIN | 指定コネクタを手動再試行 |

```typescript
type ConnectorStatusValue = 'ok' | 'cached' | 'error' | 'unconfigured';

interface ConnectorStatusItem {
  name: string;            // "alpha_vantage" | "oanda" | "fred" | "news_api" | "stooq"
  displayName: string;
  type: 'price' | 'calendar' | 'news' | 'interest';
  status: ConnectorStatusValue;
  lastSyncAt: string | null;
  errorMessage: string | null;
  isRequired: boolean;     // false = OANDA のような任意コネクタ
}

interface ConnectorStatusResponse {
  connectors: ConnectorStatusItem[];
  overallHealth: 'healthy' | 'degraded' | 'critical';
  // healthy  = 全 isRequired=true コネクタが ok/cached
  // degraded = alpha_vantage は利用可能だが、fred | news_api | stooq のいずれかが error
  // critical = alpha_vantage が error または unconfigured
}
```

| コネクタ名 | isRequired | 役割分類 | 障害時の overallHealth |
|-----------|:----------:|:------:|----------------------|
| `alpha_vantage` | true | price/hard | **critical** |
| `fred` | true | analysis/soft | degraded |
| `news_api` | true | analysis/soft | degraded |
| `stooq` | true | analysis/soft | degraded |
| `oanda` | false | price/optional | 影響なし |

> critical: alpha_vantage 障害時のみ（価格データ取得不能）
> degraded: analysis 系コネクタ障害時（スコア精度低下、動作継続）
> healthy: 全 isRequired=true が ok/cached

---

## 13. 管理者 API

| Method | Path | 認証 | 権限 | 説明 |
|--------|------|------|------|------|
| GET | `/api/v1/admin/users` | AT | ADMIN | 全ユーザー一覧 |
| GET | `/api/v1/admin/users/:id` | AT | ADMIN | ユーザー詳細 |
| PATCH | `/api/v1/admin/users/:id/role` | AT | ADMIN | ロール変更 |
| GET | `/api/v1/admin/audit-logs` | AT | ADMIN | 監査ログ一覧 |

```typescript
// PATCH /api/v1/admin/users/:id/role
// role: FREE | BASIC | PRO | PRO_PLUS のみ設定可能。ADMIN への昇格は DB 直接操作のみ（このAPIでは不可）。
interface UpdateUserRoleDto { role: 'FREE' | 'BASIC' | 'PRO' | 'PRO_PLUS'; }
```

---

## 14. AI Summary API

> AI Summary は外部 LLM API を呼び出してマーケットサマリーテキストを生成する。
> ロール別の呼び出し回数制限はサービス層で管理する（DB には専用カラムを持たず、
> Redis の `ai_summary:{userId}:{date}` キーで当日カウントを管理する）。
>
> **ロール別利用制限**
>
> | ロール | 1 日あたりの生成上限 |
> |--------|---------------------|
> | `FREE` | 0 回（利用不可）|
> | `BASIC` | 3 回 |
> | `PRO` | 無制限 |
> | `PRO_PLUS` | 無制限 |
> | `ADMIN` | 無制限 |

| Method | Path | 認証 | 権限 | 説明 |
|--------|------|------|------|------|
| POST | `/api/v1/ai-summary` | AT | BASIC \| PRO \| PRO_PLUS \| ADMIN | AI マーケットサマリー生成 |
| GET | `/api/v1/ai-summary/latest` | AT | BASIC \| PRO \| PRO_PLUS \| ADMIN | 最新 AI サマリー取得 |

```typescript
// ⚠️ 以下は擬似コード（参考）。実際の実装は Zod Schema + createZodDto を使うこと。
// 実装方法: packages/types/src/schemas/ に Zod Schema を定義し、
//            apps/api で createZodDto(Schema) を使って DTO を派生させる。

// POST /ai-summary DTO（生成リクエスト）
export class CreateAiSummaryDto {
  // [CV→Zod] @IsString() @IsNotEmpty()
  symbol: string; // 例: "EURUSD"

  // [CV→Zod] @IsEnum(Timeframe)
  timeframe: Timeframe;

  // [CV→Zod] @IsOptional() @IsUUID()
  snapshotId?: string; // 指定時は該当スナップショットをコンテキストとして使用
}

// POST /ai-summary → 201
interface AiSummaryResponse {
  id: string;
  symbol: string;
  timeframe: Timeframe;
  summary: string;           // LLM 生成テキスト
  generatedAt: string;       // ISO 8601
  snapshotId: string | null; // コンテキストに使用したスナップショット ID
  remainingToday: number | null; // null = 無制限（PRO | PRO_PLUS | ADMIN）
}

// GET /ai-summary/latest クエリパラメータ
export class GetLatestAiSummaryQueryDto {
  // [CV→Zod] @IsString() @IsNotEmpty()
  symbol: string;

  // [CV→Zod] @IsEnum(Timeframe)
  timeframe: Timeframe;
}

// GET /ai-summary/latest → 200
// 指定ペア・時間足の最新サマリーを返す。存在しない場合は 404。
// AiSummaryResponse と同型。

// POST /ai-summary → 429 RATE_LIMIT_EXCEEDED
// BASIC ロールが 1 日 3 回の上限を超えた場合
```

---

## 15. エラーコード一覧

| HTTP | Error Code | 意味 | 発生箇所例 |
|------|-----------|------|----------|
| 400 | `VALIDATION_ERROR` | リクエスト値不正 | DTO バリデーション失敗 |
| 401 | `UNAUTHORIZED` | 未認証 | AT なし / 期限切れ |
| 401 | `INVALID_CREDENTIALS` | メール or パスワード不一致 | /auth/login |
| 401 | `REFRESH_TOKEN_EXPIRED` | RT 期限切れ | /auth/refresh |
| 403 | `FORBIDDEN` | 権限不足 | FREE ロールが /predictions にアクセス |
| 404 | `NOT_FOUND` | リソース不存在 | 存在しない trade_id 指定 |
| 409 | `ALREADY_EXISTS` | 重複 | 同一 email での register |
| 409 | `TRADE_ALREADY_CLOSED` | 既クローズ済み | /trades/:id/close を2回実行 |
| 422 | `SCORE_TOO_LOW` | スコア閾値未満 | エントリー不可状態の明示 |
| 429 | `RATE_LIMIT_EXCEEDED` | レート超過 | API 呼び出し過多 / AI Summary 日次上限超過 |
| 503 | `CONNECTOR_UNAVAILABLE` | 外部 API 障害 | Alpha Vantage タイムアウト |

### 統一エラーレスポンス形式

```json
{
  "statusCode": 403,
  "error": "FORBIDDEN",
  "message": "この機能は PRO | PRO_PLUS | ADMIN のみ利用できます",
  "timestamp": "2025-03-06T10:00:00.000Z",
  "path": "/api/v1/predictions/jobs"
}
```

---

## 16. レート制限設定

```typescript
// apps/api/src/main.ts
// throttler 設定（NestJS Throttler）
ThrottlerModule.forRoot([
  { name: 'global',  ttl: 60_000, limit: 120 }, // 全エンドポイント: 120req/分
  { name: 'auth',    ttl: 60_000, limit: 10  }, // Auth エンドポイント: 10req/分
  { name: 'capture', ttl: 60_000, limit: 20  }, // snapshot capture: 20req/分
])
```

---

## 17. CORS 設定

```typescript
// apps/api/src/main.ts
app.enableCors({
  origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  credentials: true,       // Cookie 送受信のため必須
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});
```

---

*Part 3 完了 — 次: Part 4 → スコアエンジン · 状態遷移 · リスク管理 · 認証 / 権限 · 非同期ジョブ*
