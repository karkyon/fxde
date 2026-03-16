/**
 * apps/api/src/plugins-runtime/executor/auto-chart-pattern/double-bottom.detector.ts
 */
import type { Candle } from '../../types/plugin-execution-context';
import { round4 } from './swing.util';

const PLUGIN_KEY = 'auto-chart-pattern-engine';

export function detectDoubleBottom(
  candles: Candle[],
  troughs: number[],
): { overlays: unknown[]; signals: unknown[] } {
  const overlays: unknown[] = [];
  const signals:  unknown[] = [];
  if (troughs.length < 2) return { overlays, signals };

  for (let i = 0; i < troughs.length - 1; i++) {
    const t1I = troughs[i];
    const t2I = troughs[i + 1];
    const t1  = candles[t1I].low;
    const t2  = candles[t2I].low;
    if (Math.abs(t1 - t2) / Math.min(t1, t2) > 0.008) continue;
    const gap = t2I - t1I;
    if (gap < 8 || gap > 40) continue;

    const botY = (t1 + t2) / 2;
    let neckY = -Infinity;
    for (let j = t1I; j <= t2I; j++) {
      if (candles[j].high > neckY) neckY = candles[j].high;
    }

    overlays.push({ id: `${PLUGIN_KEY}-db-t1-${t1I}`, pluginKey: PLUGIN_KEY, kind: 'marker', label: 'Bot', visible: true, priority: 20, style: { color: '#2EC96A' }, geometry: { time: candles[t1I].time, price: round4(t1), shape: 'diamond' } });
    overlays.push({ id: `${PLUGIN_KEY}-db-t2-${t2I}`, pluginKey: PLUGIN_KEY, kind: 'marker', label: 'Bot', visible: true, priority: 20, style: { color: '#2EC96A' }, geometry: { time: candles[t2I].time, price: round4(t2), shape: 'diamond' } });
    overlays.push({ id: `${PLUGIN_KEY}-db-support-${t1I}`, pluginKey: PLUGIN_KEY, kind: 'line', label: 'Support', visible: true, priority: 21, style: { color: '#2EC96A', lineStyle: 'dashed', lineWidth: 1 }, geometry: { price: round4(botY) } });
    overlays.push({ id: `${PLUGIN_KEY}-db-neck-${t1I}`, pluginKey: PLUGIN_KEY, kind: 'line', label: 'Neckline', visible: true, priority: 22, style: { color: '#E8B830', lineStyle: 'dotted', lineWidth: 1 }, geometry: { price: round4(neckY) } });

    signals.push({ id: `${PLUGIN_KEY}-db-signal-${t2I}`, pluginKey: PLUGIN_KEY, label: 'Double Bottom', direction: 'BUY' as const, confidence: 0.65, timestamp: candles[t2I].time, price: round4(neckY), meta: { pattern: 'double_bottom' } });
    break;
  }
  return { overlays, signals };
}