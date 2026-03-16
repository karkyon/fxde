/**
 * apps/api/src/plugins-runtime/executor/auto-chart-pattern-engine.adapter.ts
 */

import type { PluginExecutionContext, PluginRawOutput } from '../types/plugin-execution-context';
import { runAutoChartPatternDetectors }                 from './auto-chart-pattern/pattern-engine.service';
import { ConditionContextEngineService }                from '../context/condition-context-engine.service';

const conditionCtx = new ConditionContextEngineService();

export async function executeAutoChartPatternEngine(
  ctx: PluginExecutionContext,
): Promise<PluginRawOutput> {
  const candles   = ctx.candles ?? [];
  const symbol    = ctx.symbol    ?? '';
  const timeframe = ctx.timeframe ?? '';
  const higherCandles = ctx.higherCandles;

  if (candles.length < 30) {
    return { overlays: [], signals: [], indicators: [] };
  }

  const raw = runAutoChartPatternDetectors(candles) as PluginRawOutput;

  // context 付与: 各 signal の metadata に context を追加
  const enrichedSignals = (raw.signals ?? []).map((sig) => {
    const s = sig as Record<string, unknown>;
    const meta = (s['meta'] as Record<string, unknown> | undefined) ?? {};
    const patternType = (meta['pattern'] as string | undefined) ?? 'unknown';
    const direction   = (s['direction'] as string | undefined);

    // 検出 candle index: timestamp から逆引き（なければ末尾）
    const timestamp = s['timestamp'] as string | undefined;
    const detectedIndex = timestamp
      ? Math.max(candles.findIndex((c) => c.time >= timestamp), candles.length - 1)
      : candles.length - 1;

    const context = conditionCtx.build({
      symbol,
      timeframe,
      candles,
      detectedIndex,
      patternType,
      direction,
      higherTimeframeCandles: higherCandles,
    });

    return {
      ...s,
      meta: { ...meta, context },
    };
  });

  return {
    overlays:   raw.overlays   ?? [],
    signals:    enrichedSignals,
    indicators: raw.indicators ?? [],
  };
}