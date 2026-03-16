/**
 * apps/api/src/plugins-runtime/executor/auto-chart-pattern/swing.util.ts
 *
 * ピーク / トラフ検出とユーティリティ関数
 */
import type { Candle } from '../../types/plugin-execution-context';

export function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** ピーク検出（左右 lookback 本より高い点） */
export function findPeaks(candles: Candle[], lookback = 3): number[] {
  const peaks: number[] = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    const h = candles[i].high;
    let isPeak = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j !== i && candles[j].high >= h) { isPeak = false; break; }
    }
    if (isPeak) peaks.push(i);
  }
  return peaks;
}

/** トラフ検出（左右 lookback 本より低い点） */
export function findTroughs(candles: Candle[], lookback = 3): number[] {
  const troughs: number[] = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    const l = candles[i].low;
    let isTrough = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j !== i && candles[j].low <= l) { isTrough = false; break; }
    }
    if (isTrough) troughs.push(i);
  }
  return troughs;
}

/** 2点間の傾き */
export function slope(x1: number, y1: number, x2: number, y2: number): number {
  return x2 === x1 ? 0 : (y2 - y1) / (x2 - x1);
}