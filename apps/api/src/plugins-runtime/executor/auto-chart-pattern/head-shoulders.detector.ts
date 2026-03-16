/**
 * apps/api/src/plugins-runtime/executor/auto-chart-pattern/head-shoulders.detector.ts
 */
import type { Candle } from '../../types/plugin-execution-context';
import { round4 } from './swing.util';

const PLUGIN_KEY = 'auto-chart-pattern-engine';

export function detectHeadAndShoulders(
  candles: Candle[],
  peaks: number[],
): { overlays: unknown[]; signals: unknown[] } {
  const overlays: unknown[] = [];
  const signals:  unknown[] = [];
  if (peaks.length < 3) return { overlays, signals };

  for (let i = 0; i < peaks.length - 2; i++) {
    const lShI = peaks[i];
    const headI = peaks[i + 1];
    const rShI  = peaks[i + 2];
    const lSh = candles[lShI].high;
    const head = candles[headI].high;
    const rSh  = candles[rShI].high;

    if (head <= lSh * 1.002 || head <= rSh * 1.002) continue;
    if (Math.abs(lSh - rSh) / Math.max(lSh, rSh) > 0.015) continue;
    if (headI - lShI < 5 || rShI - headI < 5) continue;

    const neckY = (candles[lShI].low + candles[rShI].low) / 2;

    overlays.push({ id: `${PLUGIN_KEY}-hs-lsh-${lShI}`, pluginKey: PLUGIN_KEY, kind: 'marker', label: 'L.Sh', visible: true, priority: 20, style: { color: '#E05252' }, geometry: { time: candles[lShI].time, price: lSh, shape: 'triangle_down' } });
    overlays.push({ id: `${PLUGIN_KEY}-hs-head-${headI}`, pluginKey: PLUGIN_KEY, kind: 'marker', label: 'Head', visible: true, priority: 21, style: { color: '#E05252' }, geometry: { time: candles[headI].time, price: head, shape: 'triangle_down' } });
    overlays.push({ id: `${PLUGIN_KEY}-hs-rsh-${rShI}`, pluginKey: PLUGIN_KEY, kind: 'marker', label: 'R.Sh', visible: true, priority: 20, style: { color: '#E05252' }, geometry: { time: candles[rShI].time, price: rSh, shape: 'triangle_down' } });
    overlays.push({ id: `${PLUGIN_KEY}-hs-neck-${headI}`, pluginKey: PLUGIN_KEY, kind: 'line', label: 'Neckline', visible: true, priority: 22, style: { color: '#E05252', lineStyle: 'dashed', lineWidth: 1 }, geometry: { price: round4(neckY) } });

    signals.push({ id: `${PLUGIN_KEY}-hs-signal-${headI}`, pluginKey: PLUGIN_KEY, label: 'Head & Shoulders', direction: 'SELL' as const, confidence: 0.70, timestamp: candles[rShI].time, price: round4(neckY), meta: { pattern: 'head_and_shoulders', headIdx: headI } });
    break;
  }
  return { overlays, signals };
}

export function detectInverseHeadAndShoulders(
  candles: Candle[],
  troughs: number[],
): { overlays: unknown[]; signals: unknown[] } {
  const overlays: unknown[] = [];
  const signals:  unknown[] = [];
  if (troughs.length < 3) return { overlays, signals };

  for (let i = 0; i < troughs.length - 2; i++) {
    const lShI  = troughs[i];
    const headI = troughs[i + 1];
    const rShI  = troughs[i + 2];
    const lSh  = candles[lShI].low;
    const head = candles[headI].low;
    const rSh  = candles[rShI].low;

    if (head >= lSh * 0.998 || head >= rSh * 0.998) continue;
    if (Math.abs(lSh - rSh) / Math.min(lSh, rSh) > 0.015) continue;
    if (headI - lShI < 5 || rShI - headI < 5) continue;

    const neckY = (candles[lShI].high + candles[rShI].high) / 2;

    overlays.push({ id: `${PLUGIN_KEY}-ihs-lsh-${lShI}`, pluginKey: PLUGIN_KEY, kind: 'marker', label: 'L.Sh', visible: true, priority: 20, style: { color: '#2EC96A' }, geometry: { time: candles[lShI].time, price: lSh, shape: 'triangle_up' } });
    overlays.push({ id: `${PLUGIN_KEY}-ihs-head-${headI}`, pluginKey: PLUGIN_KEY, kind: 'marker', label: 'Head', visible: true, priority: 21, style: { color: '#2EC96A' }, geometry: { time: candles[headI].time, price: head, shape: 'triangle_up' } });
    overlays.push({ id: `${PLUGIN_KEY}-ihs-rsh-${rShI}`, pluginKey: PLUGIN_KEY, kind: 'marker', label: 'R.Sh', visible: true, priority: 20, style: { color: '#2EC96A' }, geometry: { time: candles[rShI].time, price: rSh, shape: 'triangle_up' } });
    overlays.push({ id: `${PLUGIN_KEY}-ihs-neck-${headI}`, pluginKey: PLUGIN_KEY, kind: 'line', label: 'Neckline', visible: true, priority: 22, style: { color: '#2EC96A', lineStyle: 'dashed', lineWidth: 1 }, geometry: { price: round4(neckY) } });

    signals.push({ id: `${PLUGIN_KEY}-ihs-signal-${headI}`, pluginKey: PLUGIN_KEY, label: 'Inverse Head & Shoulders', direction: 'BUY' as const, confidence: 0.70, timestamp: candles[rShI].time, price: round4(neckY), meta: { pattern: 'inverse_head_and_shoulders', headIdx: headI } });
    break;
  }
  return { overlays, signals };
}