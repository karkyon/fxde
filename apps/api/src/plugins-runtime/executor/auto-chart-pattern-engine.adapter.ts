/**
 * apps/api/src/plugins-runtime/executor/auto-chart-pattern-engine.adapter.ts
 *
 * Auto Chart Pattern Engine — adapter (orchestration only)
 *
 * 責務:
 *   - candles 最低本数チェック
 *   - runAutoChartPatternDetectors() 呼び出し
 *   - PluginRawOutput を返す
 *
 * 禁止:
 *   - round4 / findPeaks / findTroughs / slope / detect* のローカル実装
 *   - detector ロジックの直接記述
 *
 * Reliability Engine 連携:
 *   PluginEventCaptureService.captureSignalEvents() が coordinator で自動呼び出しされるため
 *   このアダプタは追加実装不要。
 */

import type { PluginExecutionContext, PluginRawOutput } from '../types/plugin-execution-context';
import { runAutoChartPatternDetectors }                 from './auto-chart-pattern/pattern-engine.service';

export async function executeAutoChartPatternEngine(
  ctx: PluginExecutionContext,
): Promise<PluginRawOutput> {
  const candles = ctx.candles ?? [];

  if (candles.length < 30) {
    return { overlays: [], signals: [], indicators: [] };
  }

  return runAutoChartPatternDetectors(candles) as PluginRawOutput;
}