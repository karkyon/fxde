/**
 * apps/api/src/plugins-runtime/executor/auto-chart-pattern/channel.detector.ts
 */
import type { Candle } from '../../types/plugin-execution-context';
import { round4, slope } from './swing.util';

const PLUGIN_KEY = 'auto-chart-pattern-engine';

export function detectChannel(
  candles: Candle[],
  peaks: number[],
  troughs: number[],
): { overlays: unknown[] } {
  const overlays: unknown[] = [];
  if (peaks.length < 2 || troughs.length < 2) return { overlays };

  const rPeaks   = peaks.slice(-3);
  const rTroughs = troughs.slice(-3);
  const p1I = rPeaks[0];   const p2I = rPeaks[rPeaks.length - 1];
  const t1I = rTroughs[0]; const t2I = rTroughs[rTroughs.length - 1];

  const upperSlope = slope(p1I, candles[p1I].high, p2I, candles[p2I].high);
  const lowerSlope = slope(t1I, candles[t1I].low,  t2I, candles[t2I].low);

  const slopeDiff = Math.abs(upperSlope - lowerSlope);
  const avgPrice  = (candles[p1I].high + candles[t1I].low) / 2;
  if (slopeDiff / (avgPrice || 1) > 0.0005) return { overlays };

  const lastI      = candles.length - 1;
  const channelDir = upperSlope > 0.0001 ? 'up' : upperSlope < -0.0001 ? 'down' : 'horizontal';
  const color      = channelDir === 'up' ? '#2EC96A' : channelDir === 'down' ? '#E05252' : '#94a3b8';
  const upperEnd   = round4(candles[p1I].high + upperSlope * (lastI - p1I));
  const lowerEnd   = round4(candles[t1I].low  + lowerSlope * (lastI - t1I));

  overlays.push({ id: `${PLUGIN_KEY}-ch-upper-${p1I}`, pluginKey: PLUGIN_KEY, kind: 'line', label: `${channelDir} channel`, visible: true, priority: 10, style: { color, lineStyle: 'solid', lineWidth: 1.5, opacity: 0.7 }, geometry: { x1Time: candles[p1I].time, y1: round4(candles[p1I].high), x2Time: candles[lastI].time, y2: upperEnd } });
  overlays.push({ id: `${PLUGIN_KEY}-ch-lower-${t1I}`, pluginKey: PLUGIN_KEY, kind: 'line', label: '', visible: true, priority: 10, style: { color, lineStyle: 'solid', lineWidth: 1.5, opacity: 0.7 }, geometry: { x1Time: candles[t1I].time, y1: round4(candles[t1I].low), x2Time: candles[lastI].time, y2: lowerEnd } });

  return { overlays };
}