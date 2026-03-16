/**
 * packages/shared/src/lot-calculator.ts
 *
 * ロット計算 — calcLot() / calcSlFromAtr()
 *
 * 参照: SPEC_v51_part4 §3
 */

export interface CalcLotInput {
  balance:     number;  // 口座残高（円）
  riskPct:     number;  // リスク率 % (例: 1.0 = 1%)
  slPips:      number;  // SL pips
  symbol:      string;  // 例: "USDJPY"
  currentRate: number;  // 現在レート
}

/**
 * calcLot
 * ロット数 = リスク額 / (SLpips × pip価値/lot)
 * 小数点2桁切り捨て
 *
 * 参照: SPEC_v51_part4 §3
 */
export function calcLot(input: CalcLotInput): number {
  const { balance, riskPct, slPips, symbol, currentRate } = input;
  if (slPips <= 0 || balance <= 0) return 0;

  const riskAmount = balance * (riskPct / 100);

  // pip 価値 / lot（円建て）
  // JPY ペア: 1pip = 0.01, 1lot = 100,000 → pip価値 = 1,000円/lot
  // 非JPY ペア: 1pip = 0.0001, 1lot = 100,000 → pip価値 = 10USD → JPY換算
  let pipValuePerLot: number;
  const upperSymbol = symbol.toUpperCase();
  if (upperSymbol.endsWith('JPY') || upperSymbol.includes('JPY')) {
    pipValuePerLot = 1_000;
  } else {
    pipValuePerLot = 10 * currentRate;
  }

  const rawLot = riskAmount / (slPips * pipValuePerLot);
  return Math.floor(rawLot * 100) / 100;  // 小数点2桁切り捨て
}

/**
 * calcSlFromAtr
 * ATR × multiplier をピップス換算して SL を算出する（概算）
 *
 * 参照: SPEC_v51_part4 §3
 */
export function calcSlFromAtr(atr: number, multiplier: number, isJpyPair = false): number {
  const pipSize = isJpyPair ? 0.01 : 0.0001;
  return Math.round((atr * multiplier) / pipSize);
}