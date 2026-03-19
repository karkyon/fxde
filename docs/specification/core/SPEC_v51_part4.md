# FX Discipline Engine — 統合仕様書 v5.1
## SPEC-v5.1 / Part 4 : スコアエンジン · 状態遷移 · リスク管理 · 認証/権限 · 非同期ジョブ · AI 要約

---

## 0. 本 Part の実装対象モジュール位置

本 Part に定義するすべてのロジック・サービスは、以下のモノレポ構成に従って配置する。

```
fxde/
├── apps/
│   └── api/                              ← NestJS バックエンド
│       └── src/
│           ├── auth/                     ← §4 認証・権限（JWT / RBAC）
│           ├── predictions/              ← §5 prediction-dispatch BullMQ（スタブのみ）
│           ├── jobs/                     ← §5 BullMQ ワーカー全定義（7 キュー）
│           └── ai-summary/               ← §6 AI 市場要約（Claude API 連携）
└── packages/
    ├── types/                            ← Zod Schema 正本・共通型・enum
    │   └── src/
    │       ├── schemas/                  ← バリデーション Zod Schema（DTOの正本）
    │       ├── api.ts                    ← レスポンス型・ページネーション型
    │       └── enums.ts                  ← UserRole / EntryState / ScoreBand 等
    └── shared/                           ← スコアエンジン・EntryDecision・ロット計算
        └── src/
            ├── score-engine.ts           ← calculateScore()（§1 定義）
            ├── entry-decision.ts         ← evaluateEntryDecision()（§2 定義）
            └── lot-calculator.ts         ← calcLot() / calcSlFromAtr()（§3 定義）
```

> **バリデーション主従ルール（Part 1 §5 準拠）:**  
> `packages/types/src/schemas/` の Zod Schema が正本。  
> NestJS DTO は `createZodDto()` で派生させる。`class-validator` 手書き禁止。

---

## 1. スコアエンジン（唯一の真実）

> **⚠️ この章の定義がコード・UI・テストの全判定基準。**  
> スコア計算は `packages/shared/src/score-engine.ts` に実装し、  
> API・フロントの両方から import して使う（重複実装禁止）。

### 1.1 計算式サマリー

```
総合スコア = Tech(max40) + Fund(max30) + Market(max10) + RR(max10) + PatternBonus(max+15)
           → 合計が 100 を超える場合は 100 に正規化
           → RR < 1.0 の場合: RR点 = 0 かつ EntryState = RISK_NG（スコア値に関わらずエントリー不可）
```

### 1.2 テクニカル評価（max 40 点）

#### MA（移動平均線） — max 10 点

| 条件 | 点数 |
|------|------|
| EMA50 > SMA200 かつ EMA50 の傾き上向き（GC 確認済み） | 10 |
| EMA50 > SMA200 だが傾きが横ばい（±0.1% 以内） | 6 |
| EMA50 < SMA200（DC 確認済み） | 0 |

```typescript
// packages/shared/src/score-engine.ts
function scoreMa(ma50: number, ma200: number, slope: number): number {
  if (ma50 > ma200 && slope > 0.001) return 10;
  if (ma50 > ma200)                  return 6;
  return 0;
}
```

#### RSI — max 8 点（+ ダイバージェンスボーナス +2）

| RSI 値 | BUY 方向 点数 | SELL 方向 点数 |
|--------|-------------|--------------|
| ≤ 30（売られすぎ） | 8 | 0 |
| 30〜50 | 6 | 2 |
| 50〜70 | 4 | 4 |
| ≥ 70（買われすぎ） | 0 | 8 |
| ダイバージェンス確認（上記に加算） | +2 | +2 |

> `side` は直近のトレンド方向（BUY / SELL bias）で判定。  
> ダイバージェンスは価格安値が切り下がりつつ RSI 安値が切り上がる場合（強気）、またはその逆（弱気）。

#### MACD — max 10 点（+ ゼロライン上抜けボーナス +2）

| 条件 | 点数 |
|------|------|
| MACD 線 > シグナル線 かつ ヒストグラム拡大中 | 10 |
| MACD 線 > シグナル線 だがヒストグラム縮小 | 6 |
| MACD 線 < シグナル線（下降クロス） | 0 |
| ゼロライン上抜け（上記に加算） | +2 |

#### 上位足整合 MTF — max 12 点

エントリー足ごとの確認対象足と重みは以下で固定する。

| エントリー足 | 確認足 1（重み 50%） | 確認足 2（重み 30%） | 確認足 3（重み 20%） |
|-----------|-----------|-----------|-----------|
| H4（デフォルト） | D1 | W1 | H1 |
| H1 | H4 | D1 | M30 |
| D1 | W1 | MN | H4 |
| M15 | H1 | H4 | M30 |

```typescript
function scoreMtf(entryTf: Timeframe, direction: 'BUY'|'SELL', mtfData: MtfData): number {
  const weights = MTF_WEIGHTS[entryTf]; // 上表の重み
  let score = 0;
  for (const [tf, weight] of Object.entries(weights)) {
    if (mtfData[tf]?.direction === direction) score += weight;
  }
  return Math.round(score * 12); // 最大 12 点に正規化
}
```

---

### 1.3 ファンダメンタル評価（max 30 点）

#### 金利差 — max 10 点

```
取引方向と金利差が一致（高金利通貨を BUY）: 10 点
金利差 ±0.25% 以内（中立域）              :  5 点
取引方向と金利差が逆方向                  :  0 点
```

金利差 = base 通貨の政策金利 − quote 通貨の政策金利  
例: EURUSD の BUY なら EUR 金利 > USD 金利が有利

#### 経済指標スコア — max 10 点

```typescript
function scoreFundamentals(events: EconomicEvent[]): number {
  // 直近 30 日の重要度 HIGH / CRITICAL のイベントのみ対象
  const relevant = events.filter(e =>
    ['HIGH','CRITICAL'].includes(e.importance) &&
    e.actual !== null && e.forecast !== null
  );

  let weighted = 0;
  let totalWeight = 0;

  for (const e of relevant) {
    const deviation = (e.actual! - e.forecast!) / Math.abs(e.forecast! || 1);
    const w = e.importance === 'CRITICAL' ? 2 : 1;
    weighted += deviation * w;
    totalWeight += w;
  }

  if (totalWeight === 0) return 5; // データなし → 中立 5 点

  const normalized = weighted / totalWeight; // -1.0 〜 +1.0
  return Math.round((normalized + 1) / 2 * 10); // 0〜10 点に変換
}
```

#### NLP 感情スコア — max 10 点

```typescript
function scoreNlp(sentimentScore: number): number {
  // sentimentScore: -1.0（悲観）〜 +1.0（楽観）
  if (sentimentScore >=  0.5) return 10;
  if (sentimentScore >=  0.2) return  7;
  if (sentimentScore >= -0.2) return  5; // 中立
  if (sentimentScore >= -0.5) return  3;
  return 0;
}
```

ニュース感情スコアは BullMQ `news-sync` ジョブが NewsAPI + 簡易センチメント解析で算出し  
Redis にキャッシュ。スコア計算時はキャッシュから読む。

---

### 1.4 市場安定性評価（max 10 点）

#### ATR ボラティリティ適正 — max 10 点

```typescript
function scoreAtr(currentAtr: number, avgAtr30: number): number {
  const ratio = currentAtr / avgAtr30;
  if (ratio >= 0.5 && ratio <= 1.2) return 10; // 正常範囲
  if (ratio > 1.2 && ratio <= 1.5)  return  5; // やや高い
  return 0; // 極端に高い / 低い
}
```

#### 指標前後ペナルティ（ATR 点に加算ではなく強制上書き）

```
重要指標 30 分前〜発表直後 15 分: EntryState を LOCKED に強制設定
→ スコア計算自体は続けるが、LOCKED が優先される
```

---

### 1.5 RR レシオ評価（max 10 点）

```typescript
function scoreRr(rr: number): number {
  if (rr <  1.0) return 0;  // ← この場合 EntryState = RISK_NG も同時に発動
  if (rr <  1.5) return 6;
  if (rr <  2.0) return 8;
  return 10;
}
```

---

### 1.6 チャートパターンボーナス（max +15 点）

| パターン | ボーナス点 | 最低信頼度 |
|---------|----------|----------|
| ヘッドアンドショルダー | +10 | 75% |
| ダブルボトム / ダブルトップ | +8 | 70% |
| トライアングル（ブレイク確認済み） | +7 | 70% |
| 明けの明星 / 宵の明星 | +6 | 70% |
| 赤三兵 / 三羽カラス | +6 | 70% |
| フラッグ / ペナント | +6 | 65% |
| カップアンドハンドル | +5 | 65% |
| ブリッシュ / ベアリッシュ ピンバー | +5 | 60% |
| エンゴルフィングバー | +4 | 65% |

```typescript
function scorePatternBonus(patterns: PatternData[], featureEnabled: boolean): number {
  if (!featureEnabled) return 0;
  const eligible = patterns.filter(p => p.confidence >= p.minConfidence);
  if (eligible.length === 0) return 0;
  // 最高点のパターンのみ採用（重複加算なし）
  // 反転パターン + 継続パターンが競合する場合は 0（判断不能）
  const hasReversal    = eligible.some(p => REVERSAL_PATTERNS.includes(p.name));
  const hasContinuation = eligible.some(p => CONTINUATION_PATTERNS.includes(p.name));
  if (hasReversal && hasContinuation) return 0;
  return Math.min(15, Math.max(...eligible.map(p => p.bonus)));
}
```

---

### 1.7 スコア正規化と最終計算

```typescript
export function calculateScore(input: ScoreInput): ScoreResult {
  const tech       = scoreMa(...)  + scoreRsi(...) + scoreMacd(...) + scoreMtf(...);
  const fund       = scoreInterestRate(...) + scoreFundamentals(...) + scoreNlp(...);
  const market     = scoreAtr(...);
  const rr         = scoreRr(input.rr);
  const patBonus   = scorePatternBonus(input.patterns, input.featureSwitches.patternBonus);

  const raw   = tech + fund + market + rr + patBonus;
  const total = Math.min(100, Math.max(0, raw));

  return {
    total,
    breakdown: { technical: tech, fundamental: fund, market, rr, patternBonus: patBonus },
  };
}
```

---

## 2. エントリー状態遷移（唯一の真実）

### 2.1 状態決定ロジック（優先順）

```typescript
// packages/shared/src/entry-decision.ts

export interface EntryContext {
  score:          number;
  rr:             number;
  lotSize:        number;  // 実際に入力されたロットサイズ
  maxLot:         number;  // calcLot() で算出した上限ロット（riskProfile から動的計算）
  isEventWindow:  boolean;  // 指標 30 分前〜発表後 15 分
  isCooldown:     boolean;  // 連敗超過 / 日次損失率超過 → COOLDOWN
  isDailyLimit:   boolean;  // 当日トレード数上限超過 → LOCKED（shouldTriggerCooldown とは独立）
  forceLock:      boolean;  // 設定画面で強制 ON → LOCKED
  scoreThreshold: number;   // ユーザー設定値
}

export interface EntryDecision {
  status:         EntryState;
  reasons:        string[];
  recommendation: string;
}

export function evaluateEntryDecision(ctx: EntryContext): EntryDecision {
  // 優先順 1: 強制ロック（設定による手動ロック）
  if (ctx.forceLock) return {
    status: 'LOCKED',
    reasons: ['強制ロックが有効です'],
    recommendation: '設定画面で強制ロックを解除してください',
  };

  // 優先順 2: クールダウン（連敗超過 / 日次損失率超過）
  if (ctx.isCooldown) return {
    status: 'COOLDOWN',
    reasons: ['クールダウン中です'],
    recommendation: 'タイマーが終了するまでエントリーを控えてください',
  };

  // 優先順 3: 指標前後ロック
  if (ctx.isEventWindow) return {
    status: 'LOCKED',
    reasons: ['重要指標の前後 30/15 分はエントリー禁止です'],
    recommendation: '指標発表後 15 分が経過してから再評価してください',
  };

  // 優先順 4: 当日トレード数上限（isDailyTradeLimitReached の結果を受け取る）
  if (ctx.isDailyLimit) return {
    status: 'LOCKED',
    reasons: ['本日のトレード数が上限に達しています'],
    recommendation: '明日以降にエントリーしてください',
  };

  // 優先順 5: RR / ロット確認
  if (ctx.rr < 1.0) return {
    status: 'RISK_NG',
    reasons: [`RR 比 ${ctx.rr.toFixed(2)} が基準 1.0 を下回っています`],
    recommendation: 'SL を近づけるか TP を遠ざけて RR ≥ 1.0 にしてください',
  };
  if (ctx.lotSize > ctx.maxLot) return {
    status: 'RISK_NG',
    reasons: [`ロット数 ${ctx.lotSize} が上限 ${ctx.maxLot} を超えています`],
    recommendation: 'ロットサイズを下げてください',
  };

  // 優先順 6: スコア閾値
  if (ctx.score < ctx.scoreThreshold) return {
    status: 'SCORE_LOW',
    reasons: [`スコア ${ctx.score} 点 / 基準 ${ctx.scoreThreshold} 点（あと ${ctx.scoreThreshold - ctx.score} 点）`],
    recommendation: `スコアが ${ctx.scoreThreshold} 点に達するまで待機してください`,
  };

  // 全条件クリア
  return {
    status: 'ENTRY_OK',
    reasons: [],
    recommendation: 'エントリー条件が揃っています。最終判断はご自身で行ってください。',
  };
}
```

### 2.2 状態別 UI 表示仕様（確定）

| EntryState | UI ラベル | 背景色 | エントリーボタン |
|-----------|---------|--------|--------------|
| `ENTRY_OK` | ✅ ENTRY OK | `#1A4A2E`（深緑） | 有効・緑色 |
| `SCORE_LOW` | 🟡 WAIT | `#3A3010`（深黄） | ロック（クリックで振動）|
| `RISK_NG` | ⚠️ RISK NG | `#4A1010`（深赤） | ロック |
| `LOCKED` | 🔒 LOCKED | `#1A1A2E`（深紺） | 無効化・グレー |
| `COOLDOWN` | ⏳ COOLDOWN | `#3A1A00`（深橙） | タイマー表示 |

### 2.3 スコア帯カラー（確定）

| スコア範囲 | Band | カラーコード（dark） | ラベル |
|----------|------|----------------|-------|
| 0〜49 | LOW | `#E05252` | エントリー回避 |
| 50〜74 | MID | `#E8B830` | 条件待機 |
| 75〜100 | HIGH | `#2EC96A` | エントリー検討可 |

> **廃止語**: AVOID / WATCH / READY はすべて v4 の表現。v5 以降は使用禁止。  
> ScoreBand は「視覚的な色分け分類」であり、EntryState（状態機械）とは別の概念。

---

## 3. リスク管理仕様

### 3.1 プリセット定義（確定・変更不可）

| 項目 | conservative | standard | aggressive |
|------|-------------|---------|-----------|
| scoreThreshold | **85** | **75** | **70** |
| maxRiskPct (%) | 0.5 | 1.0 | 2.0 |
| maxDailyLossPct (%) | 1.5 | 3.0 | 6.0 |
| maxStreak | 2 | 3 | 5 |
| cooldownMin | 60 | 30 | 15 |
| maxTrades / 日 | 2 | 3 | 5 |
| atrMultiplier | 1.5 | 1.5 | 2.0 |

> ユーザーが個別上書きした場合はそちらを優先。  
> プリセット再選択時は上書き値をリセットして初期値に戻す。

### 3.2 ロット計算式

```typescript
// packages/shared/src/lot-calculator.ts

export interface LotCalcInput {
  balance:       number;  // 口座残高（円）
  riskPct:       number;  // リスク率 (%)
  slPips:        number;  // SL 幅（pips）
  symbol:        string;  // 例: "USDJPY", "EURUSD"
  currentRate:   number;  // 現在レート
}

export function calcLot(input: LotCalcInput): number {
  const { balance, riskPct, slPips, symbol, currentRate } = input;
  const riskAmount = balance * riskPct / 100;

  // pip 単価の算出（1 lot = 100,000 通貨単位）
  let pipValue: number;
  if (symbol.endsWith('JPY')) {
    // JPY クロス: 1 pip = 0.01 円 × 100,000 = 1,000 円 / lot
    pipValue = 1000;
  } else if (symbol.startsWith('USD')) {
    // USD が基軸（USDCHF, USDCAD 等）: 1 pip = $0.0001 × 100,000 × rate
    pipValue = 10 * currentRate;
  } else {
    // EUR/GBP/AUD 等: 1 pip = $0.0001 × 100,000 ÷ USDJPY rate
    pipValue = (10 / currentRate) * 100; // 概算（円換算）
  }

  const raw = riskAmount / (slPips * pipValue);
  return Math.floor(raw * 100) / 100; // 小数点 2 桁切り捨て
}
```

### 3.3 ATR ベース SL 自動計算

```typescript
export function calcSlFromAtr(
  entryPrice: number,
  side: 'BUY' | 'SELL',
  atr: number,
  multiplier: number,
): number {
  const slDistance = atr * multiplier;
  return side === 'BUY'
    ? entryPrice - slDistance
    : entryPrice + slDistance;
}
```

### 3.4 クールダウン発動条件

```typescript
// COOLDOWN 発動条件: 連敗超過 / 日次損失率超過
// 当日トレード数超過は EntryState = LOCKED（別関数 isDailyTradeLimitReached で管理）
export function shouldTriggerCooldown(
  trades: Trade[],
  settings: UserSetting,
): { triggered: boolean; reason?: string } {
  const rp = settings.riskProfile as RiskProfile;
  const today = new Date().toDateString();
  const todayTrades = trades.filter(t => new Date(t.entryTime).toDateString() === today);

  // 条件 1: 連敗数チェック → COOLDOWN
  const recentLosses = getConsecutiveLosses(trades);
  if (recentLosses >= rp.maxStreak) return {
    triggered: true,
    reason: `連敗 ${recentLosses} 回（上限 ${rp.maxStreak} 回）`,
  };

  // 条件 2: 日次損失率チェック → COOLDOWN
  const dailyLoss = todayTrades
    .filter(t => t.pnl && t.pnl < 0)
    .reduce((sum, t) => sum + Math.abs(Number(t.pnl)), 0);
  const balance = settings.riskProfile.balance ?? 500_000; // フォールバック
  if (dailyLoss / balance * 100 >= rp.maxDailyLossPct) return {
    triggered: true,
    reason: `日次損失 ${(dailyLoss / balance * 100).toFixed(1)}%（上限 ${rp.maxDailyLossPct}%）`,
  };

  return { triggered: false };
}

// 当日トレード数上限チェック → EntryState = LOCKED
// shouldTriggerCooldown とは独立して管理する。
// evaluateEntryDecision の呼び出し側でこの結果を forceLock として渡すか、
// isEventWindow と同列の独立フラグとして扱う。
export function isDailyTradeLimitReached(
  trades: Trade[],
  settings: UserSetting,
): { reached: boolean; reason?: string } {
  const rp = settings.riskProfile as RiskProfile;
  const today = new Date().toDateString();
  const todayTrades = trades.filter(t => new Date(t.entryTime).toDateString() === today);

  if (todayTrades.length >= rp.maxTrades) return {
    reached: true,
    reason: `本日のトレード数 ${todayTrades.length} 件（上限 ${rp.maxTrades} 件）`,
  };
  return { reached: false };
}
```

---

## 4. 認証・権限（RBAC）設計

### 4.1 ロール定義

| ロール | 対応プラン | 付与方法 | 主な権限 |
|--------|:--------:|---------|---------|
| `FREE` | Free（¥0）| 登録時自動 | 1 ペア・スナップ 20 回/日・ローソク足パターン 6 種 |
| `BASIC` | Basic（¥980）| ADMIN 手動 | 4 ペア・スナップ 60 回/日・全 12 パターン・AI 要約 3 回/日 |
| `PRO` | Pro（¥2,980）| ADMIN 手動 | 8 ペア・スナップ無制限・MTF 予測・精度検証 |
| `PRO_PLUS` | Pro+（¥4,980）| ADMIN 手動 | PRO + WFV・重み学習・API アクセス |
| `ADMIN` | 社内運用 | DB 直接操作のみ | 全機能 + ユーザー管理・監査ログ |

> 「PRO 以上」という表現はコード・コメント問わず禁止。
> 「PRO | PRO_PLUS | ADMIN」と明示すること。

### 4.2 機能別権限マトリクス

| 機能 | FREE | BASIC | PRO | PRO_PLUS | ADMIN |
|------|:----:|:-----:|:---:|:--------:|:-----:|
| ダッシュボード・スコア | ✅（**1ペア**）| ✅（**4ペア**）| ✅（**8ペア**）| ✅（**8ペア**）| ✅ |
| チャートパターン検出 | ✅（6種）| ✅（12種）| ✅（12種）| ✅（12種）| ✅ |
| トレード記録 CRUD | ✅ | ✅ | ✅ | ✅ | ✅ |
| スナップショット取得 | 20回/日 | 60回/日 | 無制限 | 無制限 | 無制限 |
| 心理分析グラフ | 30日 | 90日 | 1年 | 全期間 | 全期間 |
| AI 市場要約 | ❌ | 3回/日 | 無制限 | 無制限 | 無制限 |
| CSV エクスポート | ❌ | ✅ | ✅ | ✅ | ✅ |
| MTF 予測ジョブ | ❌ | ❌ | ✅ | ✅ | ✅ |
| 精度検証ページ | ❌ | ❌ | ✅（3ヶ月）| ✅（1年）| ✅ |
| ウォークフォワード検証 | ❌ | ❌ | ❌ | ✅ | ✅ |
| 重み自動学習 | ❌ | ❌ | ❌ | ✅ | ✅ |
| API アクセス | ❌ | ❌ | ❌ | ✅ | ✅ |
| 監査ログ・ユーザー管理 | ❌ | ❌ | ❌ | ❌ | ✅ |

### 4.3 NestJS ガード実装パターン

```typescript
// apps/api/src/auth/guards/jwt-auth.guard.ts
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}

// apps/api/src/auth/guards/roles.guard.ts
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.get<UserRole[]>('roles', context.getHandler());
    if (!requiredRoles) return true;
    const { user } = context.switchToHttp().getRequest();
    return requiredRoles.includes(user.role);
  }
}

// デコレータ
export const Roles = (...roles: UserRole[]) => SetMetadata('roles', roles);

// コントローラでの使用例
@UseGuards(JwtAuthGuard, RolesGuard)
// PRO | PRO_PLUS | ADMIN が使用可能（「PRO以上」という表現は禁止）
@Roles(UserRole.PRO, UserRole.PRO_PLUS, UserRole.ADMIN)
@Post('jobs')
async createPredictionJob(@Body() dto: CreatePredictionJobDto) { ... }
```

### 4.4 JWT ペイロード設計

```typescript
export interface JwtPayload {
  sub:   string;    // user.id
  email: string;
  role:  UserRole;
  iat:   number;
  exp:   number;
}

// AccessToken: 有効期限 15 分
// RefreshToken: 有効期限 7 日、DB の sessions テーブルで管理
// RefreshToken はハッシュ化して保存（Argon2id）
```

### 4.5 セキュリティ要件

| 項目 | 仕様 |
|------|------|
| パスワード | Argon2id / min 12 文字 / 大小英字 + 数字必須 |
| AT 保存場所 | Zustand（メモリのみ。localStorage には保存しない）|
| RT 保存場所 | HttpOnly / Secure / SameSite=Strict Cookie |
| HTTPS | 本番環境は必須（v5 開発環境は localhost のみ HTTP 許可）|
| XSS 対策 | innerHTML 使用禁止。dangerouslySetInnerHTML は一切使わない |
| CSRF 対策 | SameSite=Strict Cookie + CORS でカバー。追加トークン不要 |
| SQL インジェクション | Prisma の parameterized query で自動防御 |
| レート制限 | 第 3 章参照（Throttler 設定）|

---

## 5. 非同期ジョブ設計（BullMQ）

### 5.1 キュー一覧

| キュー名 | 用途 | 実行間隔 | 対象 |
|---------|------|---------|------|
| `price-sync` | FX 価格 OHLC 取得・Redis キャッシュ更新 | 5 分 | 有効化された全シンボル × 主要時間足 |
| `snapshot-capture` | スコア自動計算 + DB 保存 + シグナル判定 | **15 分** [SPEC] | 有効化された全ユーザー × 全ペア |
| `news-sync` | ニュース取得 + 感情スコア計算 | 1 時間 | 監視通貨ペアのキーワード |
| `calendar-sync` | 経済カレンダー取得 + DB 保存 | 15 分 | 全通貨 |
| `prediction-dispatch` | **v5.1: スタブ実装のみ**（固定 JSON レスポンスを返す）v6 で DTW 本実装 | イベント駆動（ジョブ作成時） | PredictionJob（QUEUED → SUCCEEDED）|
| `ai-summary-sync` | AI 要約生成・Claude API 呼び出し・結果キャッシュ保存 | イベント駆動（user request / snapshot 完了時）| Snapshot / user request |
| `cleanup` | 期限切れセッション / 古いシグナル削除（シグナルは 90 日超を対象）| 毎日 03:00（JST） | sessions / signals |

> **スナップショット取得タイミング設計（確定）**
>
> | ジョブ | 間隔 | 根拠 |
> |--------|:----:|------|
> | `price-sync` | **5 分** [SPEC] | Alpha Vantage 500req/日の上限内。H4 以上の TTL に一致 |
> | `snapshot-capture` | **15 分** [SPEC] | H4 足の最小有意変化サイクル。5 分では無意味な再計算になる |
> | `news-sync` | **60 分** [SPEC] | NewsAPI Dev Plan 100req/日制限内の最低頻度 |
> | `calendar-sync` | **15 分** [SPEC] | 指標前後ロック判定の精度を担保する最小間隔 |
>
> **スケール計算（PoC 規模）**
>
> ```
> 50 ユーザー × 4 ペア × 3 時間足 = 600 ジョブ / 15 分 = 0.67 ジョブ/秒
> 上限目安: 100 ユーザー × 8 ペア × 5 時間足 = 4,000 ジョブ / 15 分 = 4.4 ジョブ/秒
> → Redis 単体 + BullMQ で PoC は十分。PRO 500 名超でスケールアウト検討。
> ```


### 5.2 ジョブ定義（BullMQ）

```typescript
// apps/api/src/jobs/queues.ts
import { Queue } from 'bullmq';

export const QUEUE_NAMES = {
  PRICE_SYNC:           'price-sync',
  SNAPSHOT_CAPTURE:     'snapshot-capture',
  NEWS_SYNC:            'news-sync',
  CALENDAR_SYNC:        'calendar-sync',
  PREDICTION_DISPATCH:  'prediction-dispatch',
  AI_SUMMARY_SYNC:      'ai-summary-sync',
  CLEANUP:              'cleanup',
} as const;

// ジョブデータ型
export type PriceSyncJobData = {
  symbol:    string;
  timeframe: Timeframe;
};

export type SnapshotCaptureJobData = {
  userId: string;
  symbol: string;
  timeframe: Timeframe;
};

export type PredictionDispatchJobData = {
  jobId: string;
};

export type AiSummarySyncJobData = {
  userId:     string;
  snapshotId: string;
};

// ── v5.1 スタブ実装 ────────────────────────────────────────────
// prediction-dispatch ワーカーは v5.1 では固定 JSON を返す。
// DTW 類似局面検索・シナリオ生成は v6 で実装。
// スタブは以下の動作をする:
//   1. PredictionJob.status = 'RUNNING' に更新
//   2. STUB_PREDICTION_RESULT（固定 JSON）を PredictionResult に保存
//   3. PredictionJob.status = 'SUCCEEDED' に更新
// 200ms 待機はシミュレーション目的で任意追加してよいが、実装必須ではない。
// prediction-dispatch 以外の Prediction Engine 処理（DTW / HMM / WFV / 類似検索）は
// v6 設計資料扱いであり、v5.1 ではコードを生成してはならない。
//
// ai-summary-sync ワーカーは Claude API を呼び出して要約テキストを生成・保存する。
// イベント駆動（POST /api/v1/ai-summary 受付時 または snapshot-capture 完了時に enqueue）。
// ─────────────────────────────────────────────────────────────

export type CleanupJobData = {
  target: 'sessions' | 'signals' | 'all';
};
```

### 5.3 price-sync ワーカー

```typescript
// apps/api/src/jobs/workers/price-sync.worker.ts
@Processor(QUEUE_NAMES.PRICE_SYNC)
export class PriceSyncWorker extends WorkerHost {
  constructor(
    private readonly priceFeed: IFxPriceFeed,
    private readonly redis: Redis,
  ) { super(); }

  async process(job: Job<PriceSyncJobData>): Promise<void> {
    const { symbol, timeframe } = job.data;
    const candle = await this.priceFeed.fetchLatestCandle(symbol, timeframe);

    const cacheKey = `candle:${symbol}:${timeframe}`;
    const ttl = CACHE_TTL[timeframe]; // Part 1 の TTL 設定参照
    await this.redis.set(cacheKey, JSON.stringify(candle), 'EX', ttl);
  }
}
```

### 5.4 snapshot-capture ワーカー

```typescript
// apps/api/src/jobs/workers/snapshot-capture.worker.ts
@Processor(QUEUE_NAMES.SNAPSHOT_CAPTURE)
export class SnapshotCaptureWorker extends WorkerHost {
  async process(job: Job<SnapshotCaptureJobData>): Promise<void> {
    const { userId, symbol, timeframe } = job.data;

    // 1. Redis からキャッシュ済みローソク足を取得
    const candles = await this.getCandles(symbol, timeframe);

    // 2. 指標計算
    const indicators = await this.indicatorService.calculate(candles);

    // 3. パターン検出
    const patterns = await this.patternService.detect(candles, indicators);

    // 4. MTF 整合性確認
    const mtfAlignment = await this.mtfService.align(symbol, timeframe);

    // 5. スコア計算（shared パッケージ使用）
    const settings = await this.settingsService.getByUserId(userId);
    const { total, breakdown } = calculateScore({
      indicators, patterns, mtfAlignment,
      rr: indicators.currentRr,
      featureSwitches: settings.featureSwitches,
    });

    // 6. エントリー判定（shared パッケージ使用）
    // maxLot は riskProfile の静的設定値ではなく calcLot() で動的に算出する
    const recommendedLot = calcLot({
      balance:     settings.riskProfile.balance ?? 500_000,
      riskPct:     settings.riskProfile.maxRiskPct,
      slPips:      indicators.slPips,
      symbol,
      currentRate: indicators.currentRate,
    });
    const isCooldown  = await this.tradeService.isCooldown(userId);
    const tradeLimit  = isDailyTradeLimitReached(trades, settings);
    const decision = evaluateEntryDecision({
      score:          total,
      rr:             indicators.currentRr,
      lotSize:        indicators.recommendedLot,
      maxLot:         recommendedLot,
      isEventWindow:  await this.calendarService.isEventWindow(),
      isCooldown,
      isDailyLimit:   tradeLimit.reached,  // 当日上限超過 → LOCKED（COOLDOWN とは別）
      forceLock:      settings.forceLock,
      scoreThreshold: settings.scoreThreshold,
    });

    // 7. DB 保存
    const snapshot = await this.snapshotService.save({ userId, symbol, timeframe,
      indicators, patterns, mtfAlignment,
      scoreTotal: total, scoreBreakdown: breakdown,
      entryState: decision.status,
      entryContext: { rr: indicators.currentRr, lotSize: indicators.recommendedLot,
        isEventWindow: decision.status === 'LOCKED', isCooldown: decision.status === 'COOLDOWN',
        forceLock: settings.forceLock },
    });

    // 8. シグナル生成（ENTRY_OK / LOCKED_EVENT / PATTERN_DETECTED）
    await this.signalService.generateFromSnapshot(snapshot, decision);
  }
}
```

### 5.5 prediction-dispatch ワーカー（v5.1: スタブのみ）

v5.1 の `prediction-dispatch` ワーカーは固定 JSON（`STUB_PREDICTION_RESULT`）を `PredictionResult` テーブルに書き込むスタブ処理のみを実装する。Prediction Engine 本体（DTW / HMM / 類似検索）は v6 設計資料であり、v5.1 では実装してはならない。

```typescript
// apps/api/src/jobs/prediction-dispatch.processor.ts
// v5.1: NestJS API 内の BullMQ Processor として動作させる

@Processor(QUEUE_NAMES.PREDICTION_DISPATCH)
export class PredictionDispatchProcessor extends WorkerHost {
  constructor(private readonly db: PrismaService) { super(); }

  async process(job: Job<PredictionDispatchJobData>): Promise<void> {
    const { jobId } = job.data;

    await this.db.predictionJob.update({
      where: { id: jobId },
      data: { status: 'RUNNING', startedAt: new Date() },
    });

    try {
      // v5.1: 固定 JSON を書き込む（DTW / 類似検索は v6 で本実装）
      await this.db.predictionResult.upsert({
        where:  { jobId },
        update: { resultData: STUB_PREDICTION_RESULT },
        create: { jobId, resultData: STUB_PREDICTION_RESULT },
      });

      await this.db.predictionJob.update({
        where: { id: jobId },
        data: { status: 'SUCCEEDED', finishedAt: new Date() },
      });
    } catch (error) {
      await this.db.predictionJob.update({
        where: { id: jobId },
        data: { status: 'FAILED', finishedAt: new Date() },
      });
      throw error;
    }
  }
}

// STUB_PREDICTION_RESULT 定義（Part 8 §9.3 準拠）
// packages/types/src/prediction.ts に定義し、ワーカーから import する
// export const STUB_PREDICTION_RESULT = {
//   scenarios: {
//     bull:    { probability: 0.42, target: '+0.8%', horizonBars: 12 },
//     neutral: { probability: 0.33, target: '+0.1%', horizonBars: 12 },
//     bear:    { probability: 0.25, target: '-0.5%', horizonBars: 12 },
//   },
//   stats: { matchedCases: 0, confidence: 0.55, note: 'v5.1 STUB result' },
//   tfWeights: null,
//   hmmState: null,
// };
```

### 5.6 ai-summary-sync ワーカー

```typescript
// apps/api/src/jobs/ai-summary-sync.processor.ts
@Processor(QUEUE_NAMES.AI_SUMMARY_SYNC)
export class AiSummarySyncProcessor extends WorkerHost {
  constructor(
    private readonly db:      PrismaService,
    private readonly redis:   Redis,
    private readonly summary: AiSummaryService,
  ) { super(); }

  async process(job: Job<AiSummarySyncJobData>): Promise<void> {
    const { userId, snapshotId } = job.data;

    const snapshot = await this.db.snapshot.findUniqueOrThrow({ where: { id: snapshotId } });
    const text = await this.summary.generateAiSummary(snapshot);

    // Redis にキャッシュ（TTL 1 時間）
    const cacheKey = `ai-summary:${userId}:${snapshot.symbol}`;
    await this.redis.set(cacheKey, text, 'EX', 3600);

    // DB に保存（GET /api/v1/ai-summary/latest 用）
    await this.db.aiSummary.upsert({
      where:  { userId_symbol: { userId, symbol: snapshot.symbol } },
      update: { text, createdAt: new Date() },
      create: { userId, symbol: snapshot.symbol, text },
    });
  }
}
```

> `ai-summary-sync` はスケジュール Cron を持たない。  
> `POST /api/v1/ai-summary` 受付時、またはオプションとして `snapshot-capture` 完了時に enqueue する。

### 5.7 Cron スケジュール設定

```typescript
// apps/api/src/jobs/scheduler.ts
@Injectable()
export class JobScheduler implements OnModuleInit {
  constructor(
    @InjectQueue(QUEUE_NAMES.PRICE_SYNC)       private priceQueue: Queue,
    @InjectQueue(QUEUE_NAMES.SNAPSHOT_CAPTURE) private snapQueue: Queue,
    @InjectQueue(QUEUE_NAMES.NEWS_SYNC)        private newsQueue: Queue,
    @InjectQueue(QUEUE_NAMES.CALENDAR_SYNC)    private calQueue: Queue,
    @InjectQueue(QUEUE_NAMES.CLEANUP)          private cleanupQueue: Queue,
  ) {}

  async onModuleInit() {
    // ── 注意: 以下は「ディスパッチャを enqueue する」エントリポイントである ──
    // payload が空のジョブ 1 件を cron で投入し、
    // 各 worker 内で「有効化された全シンボル × 全時間足」（price-sync）や
    // 「有効化された全ユーザー × 全ペア × 全時間足」（snapshot-capture）を
    // ループ展開して子ジョブを生成する。
    // dispatcher job 1 件だけ作って終わる実装は誤り。
    // ─────────────────────────────────────────────────────────────────────

    // price-sync: 5 分ごと（有効化された全シンボル × 時間足をループ展開）
    await this.priceQueue.add('cron-dispatch', {}, { repeat: { every: 5 * 60 * 1000 } });

    // snapshot-capture: 15 分ごと（有効化された全ユーザー × 全ペア × 全時間足をループ展開）
    await this.snapQueue.add('cron-dispatch', {}, { repeat: { every: 15 * 60 * 1000 } });

    // news-sync: 1 時間ごと
    await this.newsQueue.add('cron-dispatch', {}, { repeat: { every: 60 * 60 * 1000 } });

    // calendar-sync: 15 分ごと
    await this.calQueue.add('cron-dispatch', {}, { repeat: { every: 15 * 60 * 1000 } });

    // cleanup: 毎日 03:00 JST = 18:00 UTC
    await this.cleanupQueue.add('daily', { target: 'all' }, {
      repeat: { cron: '0 18 * * *' },
    });
  }
}
```

> `prediction-dispatch` キューは Cron スケジュールを持たない。  
> 予測ジョブは `POST /api/v1/predictions/jobs` のリクエスト受付時にイベント駆動で enqueue される。

### 5.8 ジョブ失敗時のリトライ設定

```typescript
const DEFAULT_JOB_OPTIONS: DefaultJobOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 5_000, // 初回: 5 秒 / 2 回目: 10 秒 / 3 回目: 20 秒
  },
  removeOnComplete: { count: 100 },  // 完了ジョブ最大 100 件保持
  removeOnFail:     { count: 200 },  // 失敗ジョブ最大 200 件保持
};
```

---

## 6. AI 市場要約機能（Claude API 連携）

> **v5.1 実装対象。** ダッシュボード（PG-01）の `AiSummaryBox` コンポーネントに表示する。  
> Prediction Engine 本体ではなく、スナップショット表示の補助要約機能として実装する。  
> 実装モジュール: `apps/api/src/ai-summary/`

### 6.1 アクセス制御

| ロール | 利用可否 |
|--------|---------|
| `FREE` | ❌ 不可 |
| `BASIC` | ✅ 3 回/日 |
| `PRO` | ✅ 無制限 |
| `PRO_PLUS` | ✅ 無制限 |
| `ADMIN` | ✅ 無制限 |

レート制限は Redis `INCR + EXPIRE` で実装する。キー形式: `ai-summary-limit:{userId}:{YYYY-MM-DD}`

### 6.2 API エンドポイント

| Method | Path | 説明 |
|--------|------|------|
| POST | `/api/v1/ai-summary` | AI 市場要約生成（スナップショット ID を受け取り Claude API を呼び出す）|
| GET | `/api/v1/ai-summary/latest` | 最新 AI 要約取得（キャッシュ済み結果を返す）|

### 6.3 プロンプト設計と Claude API 呼び出し

```typescript
// apps/api/src/ai-summary/ai-summary.service.ts

const SYSTEM_PROMPT = `
あなたは FX 市場の分析アシスタントです。
与えられた指標データを元に、初心者にも分かりやすく現在の市場状況を
日本語で要約してください。
技術用語は使う場合は必ず説明を添えてください。
200 字以内で。最後に必ず「最終判断はご自身でお願いします。」で締めてください。
`;

export async function generateAiSummary(snapshot: Snapshot): Promise<string> {
  const payload = buildPromptPayload(snapshot);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key':    process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      process.env.ANTHROPIC_MODEL!,  // 環境変数で管理（例: claude-sonnet-4-6）
      max_tokens: 400,
      system:     SYSTEM_PROMPT,
      messages:   [{ role: 'user', content: JSON.stringify(payload) }],
    }),
  });

  const data = await response.json();
  return data.content[0]?.text ?? '要約の生成に失敗しました。';
}

function buildPromptPayload(snap: Snapshot) {
  const ind = snap.indicators as IndicatorsData;
  const ptns = snap.patterns as PatternData[];
  const mtf  = snap.mtfAlignment as MtfAlignmentData;

  return {
    pair:       snap.symbol,
    score:      snap.scoreTotal,
    entryState: snap.entryState,
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

### 6.4 レート制限実装

```typescript
// FREE: 0回（AI要約不可）/ BASIC: 3回/日 / PRO | PRO_PLUS | ADMIN: 無制限
async function checkAiSummaryLimit(userId: string, role: UserRole): Promise<boolean> {
  const UNLIMITED_ROLES = ['PRO', 'PRO_PLUS', 'ADMIN'] as const;
  if (UNLIMITED_ROLES.includes(role as typeof UNLIMITED_ROLES[number])) return true;
  if (role === 'FREE') return false;

  // BASIC: 3 回/日
  const key   = `ai-summary-limit:${userId}:${new Date().toDateString()}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 86400); // 24 時間
  return count <= 3;
}
```

### 6.5 環境変数

| 変数名 | 説明 |
|--------|------|
| `ANTHROPIC_API_KEY` | Claude API キー（必須）|
| `ANTHROPIC_MODEL` | 使用モデル名（必須。例: `claude-sonnet-4-6`）|

> `ANTHROPIC_API_KEY` または `ANTHROPIC_MODEL` が未設定の場合、AI 要約エンドポイントは 503 を返す。

---

## 7. 非機能要件（確定値）

### 7.1 パフォーマンス目標

| 項目 | 目標値 | 測定方法 |
|------|--------|---------|
| API レスポンス（P95） | < 200ms | Supertest / k6 |
| スコア計算 1 回 | < 50ms | performance.now() |
| スナップショット取得（キャッシュあり） | < 100ms | — |
| AI 要約生成 | < 5 秒（P95 目標・ベストエフォート）| Claude API（外部要因で揺れるため厳密 SLA なし）|
| フロント初回ロード | < 3 秒（3G 回線） | Lighthouse |
| ページ切り替え | < 100ms | React Profiler |

### 7.2 ブラウザ対応

| ブラウザ | 最低バージョン |
|---------|-------------|
| Chrome | 110+ |
| Firefox | 110+ |
| Safari | 16+ |
| Edge | 110+ |
| iOS Safari | 16+ |

### 7.3 ロギング方針

```typescript
// NestJS Logger を使用。winston への差し替えは v6 以降
// ログレベル: error / warn / log / debug / verbose

// 必ずログに含める項目
// - requestId（UUID / X-Request-ID ヘッダー）
// - userId（認証済みリクエスト）
// - action（何をしたか）
// - duration（処理時間）

// ⚠️ ログに含めてはいけない項目（PII）
// - password / password_hash
// - refresh_token_hash
// - access_token
```

---

*Part 4 完了 — 次: Part 5 → 画面仕様 · フロント実装ガイド · テスト方針 · CHANGELOG*
