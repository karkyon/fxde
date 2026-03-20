// packages/shared/src/shared.spec.ts

import { calculateScore, ScoreInput }          from './score-engine';
import { evaluateEntryDecision, EntryContext }  from './entry-decision';
import { calcLot, calcSlFromAtr }               from './lot-calculator';

// ── 共通フィクスチャ ───────────────────────────────────────────────────────────

const BASE_INDICATORS: ScoreInput['indicators'] = {
  ma:   { ma50: 150, ma200: 140, slope: 0.002 },
  rsi:  { value: 45, divergence: false },
  macd: { macdLine: 0.5, signal: 0.3, histogram: 0.2 },
  atr:  { value: 0.0050, ratio: 0.8 },
};

const BASE_MTF: ScoreInput['mtfAlignment'] = {
  D1: { score: 80, direction: 'BUY' },
  W1: { score: 75, direction: 'BUY' },
  H1: { score: 70, direction: 'BUY' },
};

const BASE_INPUT: ScoreInput = {
  indicators:      BASE_INDICATORS,
  patterns:        [],
  mtfAlignment:    BASE_MTF,
  rr:              2.0,
  featureSwitches: { patternBonus: false },
  direction:       'BUY',
  entryTf:         'H4',
};

const FULL_OK_CTX: EntryContext = {
  score:          80,
  rr:             2.0,
  lotSize:        0.1,
  maxLot:         1.0,
  isEventWindow:  false,
  isCooldown:     false,
  isDailyLimit:   false,
  forceLock:      false,
  scoreThreshold: 75,
};

// ────────────────────────────────────────────────────────────────────────────

describe('calculateScore', () => {
  it('正常入力でスコアが 0〜100 の範囲に収まる', () => {
    const result = calculateScore(BASE_INPUT);
    expect(result.total).toBeGreaterThanOrEqual(0);
    expect(result.total).toBeLessThanOrEqual(100);
  });

  it('breakdown の各項目が数値として存在する', () => {
    const result = calculateScore(BASE_INPUT);
    expect(typeof result.breakdown.technical).toBe('number');
    expect(typeof result.breakdown.fundamental).toBe('number');
    expect(typeof result.breakdown.market).toBe('number');
    expect(typeof result.breakdown.rr).toBe('number');
    expect(typeof result.breakdown.patternBonus).toBe('number');
  });

  it('RR < 1.0 の場合 breakdown.rr === 0', () => {
    const result = calculateScore({ ...BASE_INPUT, rr: 0.8 });
    expect(result.breakdown.rr).toBe(0);
  });

  it('patternBonus フラグ OFF のとき patternBonus === 0', () => {
    const result = calculateScore({
      ...BASE_INPUT,
      featureSwitches: { patternBonus: false },
      patterns: [{ name: 'double_top', direction: 'SELL', confidence: 0.9, bonus: 10 }],
    });
    expect(result.breakdown.patternBonus).toBe(0);
  });

  it('patternBonus フラグ ON + 高信頼パターンで patternBonus > 0', () => {
    const result = calculateScore({
      ...BASE_INPUT,
      featureSwitches: { patternBonus: true },
      patterns: [{ name: 'double_top', direction: 'BUY', confidence: 0.9, bonus: 10 }],
    });
    expect(result.breakdown.patternBonus).toBeGreaterThan(0);
  });

  it('total は 100 を超えない（オーバーフロー防止）', () => {
    const result = calculateScore({
      ...BASE_INPUT,
      featureSwitches: { patternBonus: true },
      patterns: [{ name: 'triple_top', direction: 'BUY', confidence: 1.0, bonus: 15 }],
      rr: 3.0,
    });
    expect(result.total).toBeLessThanOrEqual(100);
  });
});

// ────────────────────────────────────────────────────────────────────────────

describe('evaluateEntryDecision', () => {
  it('全条件クリア → ENTRY_OK', () => {
    expect(evaluateEntryDecision(FULL_OK_CTX).status).toBe('ENTRY_OK');
  });

  it('forceLock=true → LOCKED（最優先）', () => {
    expect(evaluateEntryDecision({ ...FULL_OK_CTX, forceLock: true }).status).toBe('LOCKED');
  });

  it('isCooldown=true → COOLDOWN', () => {
    expect(evaluateEntryDecision({ ...FULL_OK_CTX, isCooldown: true }).status).toBe('COOLDOWN');
  });

  it('isEventWindow=true → LOCKED', () => {
    expect(evaluateEntryDecision({ ...FULL_OK_CTX, isEventWindow: true }).status).toBe('LOCKED');
  });

  it('isDailyLimit=true → LOCKED', () => {
    expect(evaluateEntryDecision({ ...FULL_OK_CTX, isDailyLimit: true }).status).toBe('LOCKED');
  });

  it('rr < 1.0 → RISK_NG', () => {
    expect(evaluateEntryDecision({ ...FULL_OK_CTX, rr: 0.9 }).status).toBe('RISK_NG');
  });

  it('lotSize > maxLot → RISK_NG', () => {
    expect(evaluateEntryDecision({ ...FULL_OK_CTX, lotSize: 2.0, maxLot: 1.0 }).status).toBe('RISK_NG');
  });

  it('score < scoreThreshold → SCORE_LOW', () => {
    expect(evaluateEntryDecision({ ...FULL_OK_CTX, score: 70, scoreThreshold: 75 }).status).toBe('SCORE_LOW');
  });

  it('優先順: forceLock > isCooldown', () => {
    const result = evaluateEntryDecision({ ...FULL_OK_CTX, forceLock: true, isCooldown: true });
    expect(result.status).toBe('LOCKED');
    expect(result.reasons[0]).toContain('強制ロック');
  });

  it('優先順: isCooldown > isEventWindow', () => {
    expect(evaluateEntryDecision({ ...FULL_OK_CTX, isCooldown: true, isEventWindow: true }).status).toBe('COOLDOWN');
  });

  it('ENTRY_OK のとき reasons は空配列', () => {
    expect(evaluateEntryDecision(FULL_OK_CTX).reasons).toEqual([]);
  });

  it('SCORE_LOW のとき reasons にスコア情報が含まれる', () => {
    const result = evaluateEntryDecision({ ...FULL_OK_CTX, score: 60, scoreThreshold: 75 });
    expect(result.reasons.length).toBeGreaterThan(0);
    expect(result.reasons[0]).toContain('60');
  });
});

// ────────────────────────────────────────────────────────────────────────────

describe('calcLot', () => {
  it('USDJPY 標準ケース — 近似値を検証', () => {
    const lot = calcLot({ balance: 500_000, riskPct: 1, slPips: 50, symbol: 'USDJPY', currentRate: 150 });
    expect(lot).toBeGreaterThan(0);
    expect(lot).toBeCloseTo(0.1, 1);
  });

  it('結果は小数点 2 桁以下', () => {
    const lot = calcLot({ balance: 300_000, riskPct: 1, slPips: 47, symbol: 'USDJPY', currentRate: 150 });
    const decimals = String(lot).split('.')[1]?.length ?? 0;
    expect(decimals).toBeLessThanOrEqual(2);
  });

  it('slPips=0 → 0 を返す（ゼロ除算防止）', () => {
    expect(calcLot({ balance: 500_000, riskPct: 1, slPips: 0, symbol: 'USDJPY', currentRate: 150 })).toBe(0);
  });

  it('balance=0 → 0 を返す', () => {
    expect(calcLot({ balance: 0, riskPct: 1, slPips: 50, symbol: 'USDJPY', currentRate: 150 })).toBe(0);
  });

  it('非 JPY ペア（EURUSD）でも正の値を返す', () => {
    expect(calcLot({ balance: 500_000, riskPct: 1, slPips: 30, symbol: 'EURUSD', currentRate: 0.92 })).toBeGreaterThan(0);
  });
});

describe('calcSlFromAtr', () => {
  it('JPY ペア: atr=0.5, mult=2.0 → 100 pips', () => {
    expect(calcSlFromAtr(0.5, 2.0, true)).toBe(100);
  });

  it('非 JPY ペア: atr=0.002, mult=1.5 → 30 pips', () => {
    expect(calcSlFromAtr(0.002, 1.5, false)).toBe(30);
  });
});