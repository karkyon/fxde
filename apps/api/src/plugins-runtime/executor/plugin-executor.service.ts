/**
 * apps/api/src/plugins-runtime/executor/plugin-executor.service.ts
 */

import { Injectable, Logger } from '@nestjs/common';
import type { ResolvedPlugin } from '../types/resolved-plugin';
import type { PluginExecutionContext, PluginRawOutput } from '../types/plugin-execution-context';
import { executeSupplyDemandZonesPro }     from './supply-demand-zones-pro.adapter';
import { executeSessionOverlayPack }        from './session-overlay-pack.adapter';
import { executeTrendBiasAnalyzer }         from './trend-bias-analyzer.adapter';
import { executeAutoChartPatternEngine }    from './auto-chart-pattern-engine.adapter';

type AdapterFn = (ctx: PluginExecutionContext) => Promise<PluginRawOutput>;

/** plugin slug → adapter 関数のマッピング */
const PLUGIN_ADAPTERS: Record<string, AdapterFn> = {
  'supply-demand-zones-pro':    executeSupplyDemandZonesPro,
  'session-overlay-pack':       executeSessionOverlayPack,
  'trend-bias-analyzer':        executeTrendBiasAnalyzer,
  'auto-chart-pattern-engine':  executeAutoChartPatternEngine,
};

export type PluginExecutionResult =
  | { status: 'SUCCEEDED'; raw: PluginRawOutput; durationMs: number }
  | { status: 'FAILED';    errorMessage: string; durationMs: number }
  | { status: 'TIMEOUT';   durationMs: number }
  | { status: 'SKIPPED';   reason: string; durationMs: 0 };

@Injectable()
export class PluginExecutorService {
  private readonly logger = new Logger(PluginExecutorService.name);

  async execute(
    plugin:  ResolvedPlugin,
    context: PluginExecutionContext,
  ): Promise<PluginExecutionResult> {
    const adapter = PLUGIN_ADAPTERS[plugin.pluginKey];

    this.logger.debug('[PluginExecutor] execute start', {
      pluginKey:  plugin.pluginKey,
      timeoutMs:  plugin.timeoutMs,
      hasAdapter: Boolean(adapter),
    });

    if (!adapter) {
      this.logger.warn(`Plugin adapter not found: ${plugin.pluginKey} → SKIPPED`);
      return { status: 'SKIPPED', reason: 'No adapter registered', durationMs: 0 };
    }

    const startAt = Date.now();

    try {
      const raw = await this._withTimeout(adapter(context), plugin.timeoutMs);
      const durationMs = Date.now() - startAt;

      this.logger.log(`Plugin ${plugin.pluginKey} SUCCEEDED in ${durationMs}ms`);
      this.logger.debug('[PluginExecutor] execute success', {
        pluginKey:  plugin.pluginKey,
        durationMs,
        overlays:   raw?.overlays?.length   ?? 0,
        signals:    raw?.signals?.length    ?? 0,
        indicators: raw?.indicators?.length ?? 0,
      });

      return { status: 'SUCCEEDED', raw, durationMs };
    } catch (err) {
      const durationMs = Date.now() - startAt;

      if (err instanceof Error && err.message === '__PLUGIN_TIMEOUT__') {
        this.logger.warn(`Plugin ${plugin.pluginKey} TIMEOUT after ${durationMs}ms`);
        return { status: 'TIMEOUT', durationMs };
      }

      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Plugin ${plugin.pluginKey} FAILED: ${msg}`);
      return { status: 'FAILED', errorMessage: msg, durationMs };
    }
  }

  private _withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('__PLUGIN_TIMEOUT__')), timeoutMs),
    );
    return Promise.race([promise, timeoutPromise]);
  }
}