/**
 * apps/web/src/lib/indicators/bollinger.ts
 *
 * Bollinger Bands 計算ユーティリティ
 * 入力: candles（close 価格配列）
 * 出力: { upper, mid, lower } 各 same length 配列（計算不能区間は null）
 */

import { calcSMA } from './sma';

export interface BollingerPoint {
  upper: number | null;
  mid:   number | null;
  lower: number | null;
}

/**
 * Bollinger Bands を計算する
 * @param closes close 価格配列
 * @param period 期間（デフォルト 20）
 * @param stddev 標準偏差の倍数（デフォルト 2）
 * @returns BollingerPoint 配列
 */
export function calcBollinger(
  closes: number[],
  period = 20,
  stddev = 2,
): BollingerPoint[] {
  if (closes.length === 0) return [];

  const sma = calcSMA(closes, period);
  const result: BollingerPoint[] = [];

  for (let i = 0; i < closes.length; i++) {
    if (sma[i] === null) {
      result.push({ upper: null, mid: null, lower: null });
      continue;
    }
    const mid = sma[i] as number;
    // 標準偏差計算
    let sumSq = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sumSq += (closes[j] - mid) ** 2;
    }
    const sd = Math.sqrt(sumSq / period);
    result.push({
      upper: mid + stddev * sd,
      mid,
      lower: mid - stddev * sd,
    });
  }

  return result;
}