/**
 * apps/api/src/plugins-runtime/executor/auto-chart-pattern/triangle.detector.ts
 */
import type { Candle } from '../../types/plugin-execution-context';
import { round4, slope } from './swing.util';

const PLUGIN_KEY = 'auto-chart-pattern-engine';

export function detectTriangle(
  candles: Candle[],
  peaks: number[],
  troughs: number[],
): { overlays: unknown[]; signals: unknown[] } {
  const overlays: unknown[] = [];
  const signals:  unknown[] = [];
  if (peaks.length < 2 || troughs.length < 2) return { overlays, signals };

  // 直近 3 点中の最遠 2 点を使用（より広いウィンドウで収束形状を検出）
  const rPeaks   = peaks.slice(-3);
  const rTroughs = troughs.slice(-3);
  const p1I = rPeaks[0];               const p2I = rPeaks[rPeaks.length - 1];
  const t1I = rTroughs[0];             const t2I = rTroughs[rTroughs.length - 1];

  const upperSlope = slope(p1I, candles[p1I].high, p2I, candles[p2I].high);
  const lowerSlope = slope(t1I, candles[t1I].low,  t2I, candles[t2I].low);

  // 収束チェック: 上辺が下辺より傾きが小さい = 収束
  const isConverging = upperSlope < lowerSlope;
  if (!isConverging) return { overlays, signals };

  const lastI = candles.length - 1;

  // apex（収束点）の x 座標 — ゼロ除算ガード付き
  let apexX = lastI + 10;
  if (Math.abs(upperSlope - lowerSlope) > 0.000001) {
    apexX = Math.round(
      (candles[t1I].low - candles[p1I].high + upperSlope * p1I - lowerSlope * t1I)
      / (upperSlope - lowerSlope),
    );
  }
  // チャート外参照を防ぐ（+20 本まで許容）
  const clampedApex = Math.min(apexX, lastI + 20);

  const upperY1 = round4(candles[p1I].high);
  const upperY2 = round4(candles[p1I].high + upperSlope * (Math.min(clampedApex, lastI) - p1I));
  const lowerY1 = round4(candles[t1I].low);
  const lowerY2 = round4(candles[t1I].low  + lowerSlope * (Math.min(clampedApex, lastI) - t1I));

  // 傾き符号で三角形種別を判定
  const triangleType = upperSlope < -0.0001 && lowerSlope > 0.0001 ? 'symmetrical'
                     : upperSlope > -0.0001 && lowerSlope > 0.0001 ? 'ascending'
                     : 'descending';

  const color = triangleType === 'ascending'  ? '#2EC96A'
              : triangleType === 'descending' ? '#E05252'
              : '#E8B830';

  const signalDir = triangleType === 'ascending'  ? 'BUY'
                  : triangleType === 'descending' ? 'SELL'
                  : 'NEUTRAL' as const;

  overlays.push({
    id: `${PLUGIN_KEY}-tri-upper-${p1I}`, pluginKey: PLUGIN_KEY,
    kind: 'line', label: `${triangleType} tri`, visible: true, priority: 15,
    style: { color, lineStyle: 'dashed', lineWidth: 1 },
    geometry: {
      x1Time: candles[p1I].time, y1: upperY1,
      x2Time: candles[Math.min(clampedApex, lastI)].time, y2: upperY2,
    },
  });
  overlays.push({
    id: `${PLUGIN_KEY}-tri-lower-${t1I}`, pluginKey: PLUGIN_KEY,
    kind: 'line', label: '', visible: true, priority: 15,
    style: { color, lineStyle: 'dashed', lineWidth: 1 },
    geometry: {
      x1Time: candles[t1I].time, y1: lowerY1,
      x2Time: candles[Math.min(clampedApex, lastI)].time, y2: lowerY2,
    },
  });

  if (signalDir !== 'NEUTRAL') {
    signals.push({
      id:        `${PLUGIN_KEY}-tri-signal-${lastI}`,
      pluginKey: PLUGIN_KEY,
      label:     `${triangleType.charAt(0).toUpperCase()}${triangleType.slice(1)} Triangle`,
      direction: signalDir,
      confidence: 0.58,
      timestamp: candles[lastI].time,
      price:     round4((candles[lastI].high + candles[lastI].low) / 2),
      meta:      { pattern: `triangle_${triangleType}` },
    });
  }

  return { overlays, signals };
}