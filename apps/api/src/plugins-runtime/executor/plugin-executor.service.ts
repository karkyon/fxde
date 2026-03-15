/**
 * apps/api/src/plugins-runtime/executor/plugin-executor.service.ts
 *
 * 単一 plugin を安全に実行する。
 *
 * 参照仕様:
 *   fxde_plugin_runtime_完全設計書 §4.4「Plugin Executor」
 *   fxde_plugin_runtime_完全設計書 §8.3「v1 の固定方針」
 *
 * v1 方針:
 *   - 同一プロセス内逐次実行（並列化なし）
 *   - timeout は plugin ごとに設定（Promise.race による制御）
 *   - try/catch による error isolation
 *   - plugin 失敗時も全体継続
 */

import { Injectable, Logger } from '@nestjs/common';
import type { ResolvedPlugin } from '../types/resolved-plugin';
import type { PluginExecutionContext, PluginRawOutput } from '../types/plugin-execution-context';
import { executeSupplyDemandZonesPro } from './supply-demand-zones-pro.adapter';

/** plugin slug → adapter 関数のマッピング */
const PLUGIN_ADAPTERS: Record<
  string,
  (ctx: PluginExecutionContext) => Promise<PluginRawOutput>
> = {
  'supply-demand-zones-pro': executeSupplyDemandZonesPro,
};

export type PluginExecutionResult =
  | { status: 'SUCCEEDED'; raw: PluginRawOutput; durationMs: number }
  | { status: 'FAILED';    errorMessage: string; durationMs: number }
  | { status: 'TIMEOUT';   durationMs: number }
  | { status: 'SKIPPED';   reason: string; durationMs: 0 };

@Injectable()
export class PluginExecutorService {
  private readonly logger = new Logger(PluginExecutorService.name);

  /**
   * 単一 plugin を安全に実行する。
   *
   * - adapter が存在しない plugin は SKIPPED
   * - timeout 超過は TIMEOUT（全体継続）
   * - 例外発生は FAILED（全体継続）
   */
  async execute(
    plugin:  ResolvedPlugin,
    context: PluginExecutionContext,
  ): Promise<PluginExecutionResult> {
    const adapter = PLUGIN_ADAPTERS[plugin.pluginKey];

    // [DEBUG] adapter 検索結果
    this.logger.debug('[PluginExecutor] execute start', {
      pluginKey:  plugin.pluginKey,
      timeoutMs:  plugin.timeoutMs,
      hasAdapter: Boolean(adapter),
    });

    if (!adapter) {
      this.logger.warn(
        `Plugin adapter not found: ${plugin.pluginKey} → SKIPPED`,
      );
      return { status: 'SKIPPED', reason: 'No adapter registered', durationMs: 0 };
    }

    const startAt = Date.now();

    try {
      const raw = await this._withTimeout(
        adapter(context),
        plugin.timeoutMs,
      );

      const durationMs = Date.now() - startAt;
      this.logger.log(
        `Plugin ${plugin.pluginKey} SUCCEEDED in ${durationMs}ms`,
      );

      // [DEBUG] 成功時の raw output 件数
      this.logger.debug('[PluginExecutor] execute success', {
        pluginKey:    plugin.pluginKey,
        durationMs,
        overlays:     raw?.overlays?.length    ?? 0,
        signals:      raw?.signals?.length     ?? 0,
        indicators:   raw?.indicators?.length  ?? 0,
      });

      return { status: 'SUCCEEDED', raw, durationMs };
    } catch (err: unknown) {
      const durationMs = Date.now() - startAt;

      if (err instanceof TimeoutError) {
        // [DEBUG] timeout
        this.logger.warn('[PluginExecutor] execute timeout', {
          pluginKey:  plugin.pluginKey,
          durationMs,
          timeoutMs:  plugin.timeoutMs,
        });
        return { status: 'TIMEOUT', durationMs };
      }

      const message =
        err instanceof Error ? err.message : String(err);
      // [DEBUG] 失敗
      this.logger.error('[PluginExecutor] execute failed', {
        pluginKey:    plugin.pluginKey,
        durationMs,
        errorMessage: message,
      });
      return { status: 'FAILED', errorMessage: message, durationMs };
    }
  }

  /** Promise に timeout を設定する（timeout 超過時に TimeoutError を throw） */
  private _withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new TimeoutError()), ms),
      ),
    ]);
  }
}

/** timeout 専用エラー型（通常の Error と区別するため） */
class TimeoutError extends Error {
  constructor() {
    super('Plugin execution timeout');
    this.name = 'TimeoutError';
  }
}