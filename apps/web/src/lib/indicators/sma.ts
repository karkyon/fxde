/**
 * apps/web/src/lib/indicators/sma.ts
 *
 * Simple Moving Average 計算ユーティリティ
 * 入力: candles（close 価格配列）
 * 出力: same length 配列（計算不能区間は null）
 */

/**
 * SMA を計算する
 * @param closes close 価格配列
 * @param period 期間
 * @returns SMA 値配列（計算不能区間は null）
 */
export function calcSMA(closes: number[], period: number): (number | null)[] {
  if (period <= 0 || closes.length === 0) return closes.map(() => null);

  const result: (number | null)[] = [];

  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) {
        sum += closes[j];
      }
      result.push(sum / period);
    }
  }

  return result;
}