/**
 * packages/shared/src/score-engine.ts
 *
 * スコアエンジン — calculateScore()
 * API・フロント両方から import して使う（重複実装禁止）
 *
 * 参照: SPEC_v51_part4 §1
 * 計算式: Tech(max40) + Fund(max30) + Market(max10) + RR(max10) + Pattern(max+15)
 *         → min(100, max(0, raw))
 */

// ── 入力型 ──────────────────────────────────────────────────────────────────

export interface ScoreIndicators {
  ma:   { ma50: number; ma200: number; slope: number };
  rsi:  { value: number; divergence: boolean };
  macd: { macdLine: number; signal: number; histogram: number };
  atr:  { value: number; ratio: number };
}

export interface ScorePattern {
  name:       string;
  direction:  'BUY' | 'SELL';
  confidence: number;
  bonus:      number;
}

export type MtfAlignment = Record<string, { score: number; direction: 'BUY' | 'SELL' | 'NEUTRAL' }>;

export interface ScoreInput {
  indicators:      ScoreIndicators;
  patterns:        ScorePattern[];
  mtfAlignment:    MtfAlignment;
  rr:              number;
  featureSwitches: { patternBonus?: boolean };
  // オプション: コネクタ接続後に渡す
  direction?:          'BUY' | 'SELL';
  entryTf?:            string;
  interestRateDiff?:   number;   // base − quote 金利差
  nlpSentiment?:       number;   // −1.0 〜 +1.0
  economicScore?:      number;   // 0〜10 事前集計済み指標スコア
}

export interface ScoreResult {
  total: number;
  breakdown: {
    technical:    number;
    fundamental:  number;
    market:       number;
    rr:           number;
    patternBonus: number;
  };
}

// ── 内部スコア関数 ────────────────────────────────────────────────────────────

// MA: max 10pt
function _scoreMa(ma50: number, ma200: number, slope: number): number {
  if (ma50 > ma200 && slope > 0.001) return 10;
  if (ma50 > ma200) return 6;
  return 0;
}

// RSI: max 8pt + divergence +2
function _scoreRsi(value: number, divergence: boolean, direction: 'BUY' | 'SELL'): number {
  let pts: number;
  if (direction === 'BUY') {
    if (value <= 30) pts = 8;
    else if (value < 50) pts = 6;
    else if (value < 70) pts = 4;
    else pts = 0;
  } else {
    if (value >= 70) pts = 8;
    else if (value >= 50) pts = 6;
    else if (value >= 30) pts = 4;
    else pts = 0;
  }
  return pts + (divergence ? 2 : 0);
}

// MACD: max 10pt + zero-line bonus +2
function _scoreMacd(macdLine: number, signal: number, histogram: number): number {
  let pts = 0;
  if (macdLine > signal) {
    pts = histogram > 0 ? 10 : 6;
  }
  if (macdLine > 0 && signal <= 0) pts += 2;  // zero-line crossover bonus
  return pts;
}

// MTF: max 12pt  (SPEC_v51_part4 §1.2)
const MTF_WEIGHTS: Record<string, Record<string, number>> = {
  H4:  { D1: 0.5, W1: 0.3, H1:  0.2 },
  H1:  { H4: 0.5, D1: 0.3, M30: 0.2 },
  D1:  { W1: 0.5, MN: 0.3, H4:  0.2 },
  M15: { H1: 0.5, H4: 0.3, M30: 0.2 },
};

function _scoreMtf(
  entryTf: string,
  direction: 'BUY' | 'SELL',
  mtfAlignment: MtfAlignment,
): number {
  const weights = MTF_WEIGHTS[entryTf] ?? MTF_WEIGHTS['H4'];
  let score = 0;
  for (const [tf, weight] of Object.entries(weights)) {
    if (mtfAlignment[tf]?.direction === direction) score += weight;
  }
  return Math.round(score * 12);
}

// 金利差: max 10pt
function _scoreInterestRate(diff: number): number {
  if (diff > 0.25)  return 10;
  if (diff >= -0.25) return 5;
  return 0;
}

// 経済指標: 0〜10pt（外部集計済みスコアをそのまま利用）
function _scoreEconomic(score: number): number {
  return Math.min(10, Math.max(0, score));
}

// NLP 感情: max 10pt
function _scoreNlp(sentiment: number): number {
  if (sentiment >= 0.5)  return 10;
  if (sentiment >= 0.2)  return 7;
  if (sentiment >= -0.2) return 5;
  if (sentiment >= -0.5) return 3;
  return 0;
}

// ATR ボラティリティ: max 10pt
function _scoreAtr(ratio: number): number {
  if (ratio >= 0.5 && ratio <= 1.2) return 10;
  if (ratio > 1.2 && ratio <= 1.5)  return 5;
  return 0;
}

// RR: max 10pt
function _scoreRr(rr: number): number {
  if (rr < 1.0) return 0;
  if (rr < 1.5) return 6;
  if (rr < 2.0) return 8;
  return 10;
}

// パターンボーナス: max +15pt
const REVERSAL_PATTERNS     = ['HeadAndShoulders', 'DoubleBottom', 'DoubleTop', 'MorningStar', 'ShootingStar'];
const CONTINUATION_PATTERNS = ['Flag', 'Triangle', 'CupAndHandle'];
const PATTERN_MIN_CONFIDENCE: Record<string, number> = {
  HeadAndShoulders: 0.75,
  DoubleBottom: 0.70, DoubleTop: 0.70,
  Triangle: 0.70, MorningStar: 0.70, ShootingStar: 0.70, ThreeSoldiers: 0.70,
  Flag: 0.65, CupAndHandle: 0.65,
  PinBar: 0.60, Engulfing: 0.65, Doji: 0.65,
};

function _scorePatternBonus(patterns: ScorePattern[], enabled: boolean): number {
  if (!enabled) return 0;
  const eligible = patterns.filter(
    (p) => p.confidence >= (PATTERN_MIN_CONFIDENCE[p.name] ?? 0.6),
  );
  if (eligible.length === 0) return 0;
  const hasReversal     = eligible.some((p) => REVERSAL_PATTERNS.includes(p.name));
  const hasContinuation = eligible.some((p) => CONTINUATION_PATTERNS.includes(p.name));
  if (hasReversal && hasContinuation) return 0;
  return Math.min(15, Math.max(...eligible.map((p) => p.bonus)));
}

// ── 公開 API ─────────────────────────────────────────────────────────────────

/**
 * calculateScore
 * コネクタ未接続時は STUB_INDICATORS を渡すことで 0 点に近い値が返る（正しい挙動）。
 * 参照: SPEC_v51_part4 §1
 */
export function calculateScore(input: ScoreInput): ScoreResult {
  const {
    indicators,
    patterns,
    mtfAlignment,
    rr,
    featureSwitches,
    direction      = 'BUY',
    entryTf        = 'H4',
    interestRateDiff = 0,
    nlpSentiment     = 0,
    economicScore    = 5,
  } = input;

  const maScore   = _scoreMa(indicators.ma.ma50, indicators.ma.ma200, indicators.ma.slope);
  const rsiScore  = _scoreRsi(indicators.rsi.value, indicators.rsi.divergence, direction);
  const macdScore = _scoreMacd(indicators.macd.macdLine, indicators.macd.signal, indicators.macd.histogram);
  const mtfScore  = _scoreMtf(entryTf, direction, mtfAlignment);
  const technical = maScore + rsiScore + macdScore + mtfScore;

  const irScore   = _scoreInterestRate(interestRateDiff);
  const econScore = _scoreEconomic(economicScore);
  const nlpScore  = _scoreNlp(nlpSentiment);
  const fundamental = irScore + econScore + nlpScore;

  const market     = _scoreAtr(indicators.atr.ratio);
  const rrScore    = _scoreRr(rr);
  const patBonus   = _scorePatternBonus(patterns, featureSwitches.patternBonus ?? false);

  const raw   = technical + fundamental + market + rrScore + patBonus;
  const total = Math.min(100, Math.max(0, raw));

  return {
    total,
    breakdown: {
      technical,
      fundamental,
      market,
      rr:           rrScore,
      patternBonus: patBonus,
    },
  };
}