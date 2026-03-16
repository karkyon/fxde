/**
 * apps/api/src/plugins-runtime/executor/auto-chart-pattern/double-top.detector.ts
 */
import type { Candle } from '../../types/plugin-execution-context';
import { round4 } from './swing.util';

const PLUGIN_KEY = 'auto-chart-pattern-engine';

export function detectDoubleTop(
  candles: Candle[],
  peaks: number[],
): { overlays: unknown[]; signals: unknown[] } {
  const overlays: unknown[] = [];
  const signals:  unknown[] = [];
  if (peaks.length < 2) return { overlays, signals };

  for (let i = 0; i < peaks.length - 1; i++) {
    const p1I = peaks[i];
    const p2I = peaks[i + 1];
    const p1  = candles[p1I].high;
    const p2  = candles[p2I].high;
    if (Math.abs(p1 - p2) / Math.max(p1, p2) > 0.008) continue;
    const gap = p2I - p1I;
    if (gap < 8 || gap > 40) continue;

    const topY = (p1 + p2) / 2;
    let neckY = Infinity;
    for (let j = p1I; j <= p2I; j++) {
      if (candles[j].low < neckY) neckY = candles[j].low;
    }

    overlays.push({ id: `${PLUGIN_KEY}-dt-p1-${p1I}`, pluginKey: PLUGIN_KEY, kind: 'marker', label: 'Top', visible: true, priority: 20, style: { color: '#E05252' }, geometry: { time: candles[p1I].time, price: round4(p1), shape: 'diamond' } });
    overlays.push({ id: `${PLUGIN_KEY}-dt-p2-${p2I}`, pluginKey: PLUGIN_KEY, kind: 'marker', label: 'Top', visible: true, priority: 20, style: { color: '#E05252' }, geometry: { time: candles[p2I].time, price: round4(p2), shape: 'diamond' } });
    overlays.push({ id: `${PLUGIN_KEY}-dt-resist-${p1I}`, pluginKey: PLUGIN_KEY, kind: 'line', label: 'Resistance', visible: true, priority: 21, style: { color: '#E05252', lineStyle: 'dashed', lineWidth: 1 }, geometry: { price: round4(topY) } });
    overlays.push({ id: `${PLUGIN_KEY}-dt-neck-${p1I}`, pluginKey: PLUGIN_KEY, kind: 'line', label: 'Neckline', visible: true, priority: 22, style: { color: '#E8B830', lineStyle: 'dotted', lineWidth: 1 }, geometry: { price: round4(neckY) } });

    signals.push({ id: `${PLUGIN_KEY}-dt-signal-${p2I}`, pluginKey: PLUGIN_KEY, label: 'Double Top', direction: 'SELL' as const, confidence: 0.65, timestamp: candles[p2I].time, price: round4(neckY), meta: { pattern: 'double_top' } });
    break;
  }
  return { overlays, signals };
}