/**
 * apps/web/src/lib/indicators/ema.ts
 *
 * Exponential Moving Average 計算ユーティリティ
 * 入力: candles（close 価格配列）
 * 出力: same length 配列（計算不能区間は null）
 */

/**
 * EMA を計算する
 * @param closes close 価格配列
 * @param period 期間
 * @returns EMA 値配列（計算不能区間は null）
 */
export function calcEMA(closes: number[], period: number): (number | null)[] {
  if (period <= 0 || closes.length === 0) return closes.map(() => null);

  const result: (number | null)[] = new Array(closes.length).fill(null);
  const k = 2 / (period + 1);

  // 最初の有効 EMA は SMA で初期化
  if (closes.length < period) return result;

  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += closes[i];
  }
  result[period - 1] = sum / period;

  for (let i = period; i < closes.length; i++) {
    const prev = result[i - 1] as number;
    result[i] = closes[i] * k + prev * (1 - k);
  }

  return result;
}