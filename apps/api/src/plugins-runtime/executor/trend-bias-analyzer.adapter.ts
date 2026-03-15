/**
 * apps/api/src/plugins-runtime/executor/trend-bias-analyzer.adapter.ts
 */

import type { PluginExecutionContext, PluginRawOutput } from '../types/plugin-execution-context';

const PLUGIN_KEY = 'trend-bias-analyzer';

export async function executeTrendBiasAnalyzer(
  ctx: PluginExecutionContext,
): Promise<PluginRawOutput> {
  const candles    = ctx.candles ?? [];
  const indicators = ctx.indicators as Record<string, unknown> | null | undefined;

  if (candles.length < 20) {
    return { overlays: [], signals: [], indicators: [] };
  }

  const biasRaw    = indicators?.['bias'] as Record<string, unknown> | undefined;
  const biasStatus = (biasRaw?.['status'] as string) ?? 'neutral';
  const biasLabel  = (biasRaw?.['label']  as string) ?? 'Neutral';

  const recent20 = candles.slice(-20);
  const recent5  = candles.slice(-5);

  const ma20 = recent20.reduce((s, c) => s + c.close, 0) / 20;
  const ma5  = recent5.reduce((s, c) => s + c.close, 0) / 5;

  const maDirection: 'BUY' | 'SELL' | 'NEUTRAL' =
    ma5 > ma20 * 1.0005 ? 'BUY' :
    ma5 < ma20 * 0.9995 ? 'SELL' :
    'NEUTRAL';

  const biasDirection: 'BUY' | 'SELL' | 'NEUTRAL' =
    biasStatus === 'bullish' ? 'BUY' :
    biasStatus === 'bearish' ? 'SELL' :
    'NEUTRAL';

  const signalDirection: 'BUY' | 'SELL' | 'NEUTRAL' =
    biasDirection === maDirection && biasDirection !== 'NEUTRAL'
      ? biasDirection
      : 'NEUTRAL';

  const latestCandle = candles[candles.length - 1];
  const confidence   = signalDirection !== 'NEUTRAL' ? 0.65 : 0.35;

  const divergence  = Math.abs((ma5 - ma20) / ma20);
  const mtfScorePct = Math.min(100, Math.round(divergence * 10000));

  const signals: unknown[] = signalDirection !== 'NEUTRAL'
    ? [{
        id:         `${PLUGIN_KEY}-signal-latest`,
        pluginKey:  PLUGIN_KEY,
        label:      `${biasLabel} Bias ${signalDirection}`,
        direction:  signalDirection,
        confidence,
        timestamp:  latestCandle.time,
        price:      latestCandle.close,
        meta: { ma5: round4(ma5), ma20: round4(ma20), source: 'trend-bias-analyzer-mvp' },
      }]
    : [];

  return {
    overlays: [],
    signals,
    indicators: [
      {
        id:        `${PLUGIN_KEY}-bias-status`,
        pluginKey: PLUGIN_KEY,
        label:     'Trend Bias',
        value:     biasLabel,
        status:    biasStatus as 'bullish' | 'bearish' | 'neutral' | 'info',
      },
      {
        id:        `${PLUGIN_KEY}-mtf-score`,
        pluginKey: PLUGIN_KEY,
        label:     'MTF Score',
        value:     mtfScorePct,
        status:    (mtfScorePct > 60 ? 'bullish' : mtfScorePct > 30 ? 'neutral' : 'bearish') as 'bullish' | 'bearish' | 'neutral',
      },
    ],
  };
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}