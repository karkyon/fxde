/**
 * packages/shared/src/entry-decision.ts
 *
 * エントリー状態遷移 — evaluateEntryDecision()
 *
 * 優先順（変更禁止）:
 *   forceLock > cooldown > eventLock > dailyLimit > riskNg > scoreLow > ENTRY_OK
 *
 * 参照: SPEC_v51_part4 §2
 */

export type EntryStateValue = 'ENTRY_OK' | 'SCORE_LOW' | 'RISK_NG' | 'LOCKED' | 'COOLDOWN';

export interface EntryContext {
  score:          number;
  rr:             number;
  lotSize:        number;
  maxLot:         number;
  isEventWindow:  boolean;
  isCooldown:     boolean;
  isDailyLimit:   boolean;
  forceLock:      boolean;
  scoreThreshold: number;
}

export interface EntryDecision {
  status:         EntryStateValue;
  reasons:        string[];
  recommendation: string;
}

/**
 * evaluateEntryDecision
 * 参照: SPEC_v51_part4 §2.1
 */
export function evaluateEntryDecision(ctx: EntryContext): EntryDecision {
  // 優先順 1: 強制ロック
  if (ctx.forceLock) return {
    status:         'LOCKED',
    reasons:        ['強制ロックが有効です'],
    recommendation: '設定画面で強制ロックを解除してください',
  };

  // 優先順 2: クールダウン
  if (ctx.isCooldown) return {
    status:         'COOLDOWN',
    reasons:        ['クールダウン中です'],
    recommendation: 'タイマーが終了するまでエントリーを控えてください',
  };

  // 優先順 3: 指標前後ロック
  if (ctx.isEventWindow) return {
    status:         'LOCKED',
    reasons:        ['重要指標の前後 30/15 分はエントリー禁止です'],
    recommendation: '指標発表後 15 分が経過してから再評価してください',
  };

  // 優先順 4: 当日トレード数上限
  if (ctx.isDailyLimit) return {
    status:         'LOCKED',
    reasons:        ['本日のトレード数が上限に達しています'],
    recommendation: '明日以降にエントリーしてください',
  };

  // 優先順 5: RR / ロット
  if (ctx.rr < 1.0) return {
    status:         'RISK_NG',
    reasons:        [`RR 比 ${ctx.rr.toFixed(2)} が基準 1.0 を下回っています`],
    recommendation: 'SL を近づけるか TP を遠ざけて RR ≥ 1.0 にしてください',
  };
  if (ctx.maxLot > 0 && ctx.lotSize > ctx.maxLot) return {
    status:         'RISK_NG',
    reasons:        [`ロット数 ${ctx.lotSize} が上限 ${ctx.maxLot} を超えています`],
    recommendation: 'ロットサイズを下げてください',
  };

  // 優先順 6: スコア閾値
  if (ctx.score < ctx.scoreThreshold) return {
    status:         'SCORE_LOW',
    reasons:        [`スコア ${ctx.score} 点 / 基準 ${ctx.scoreThreshold} 点（あと ${ctx.scoreThreshold - ctx.score} 点）`],
    recommendation: `スコアが ${ctx.scoreThreshold} 点に達するまで待機してください`,
  };

  // 全条件クリア
  return {
    status:         'ENTRY_OK',
    reasons:        [],
    recommendation: 'エントリー条件が揃っています。最終判断はご自身で行ってください。',
  };
}