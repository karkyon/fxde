/**
 * apps/api/src/plugins-runtime/coordinator/plugin-runtime-coordinator.service.ts
 *
 * Chart Runtime API リクエストの総合オーケストレーター。
 *
 * 参照仕様:
 *   fxde_plugin_runtime_完全設計書 §4.1「Plugin Runtime Coordinator」
 *   fxde_plugin_runtime_完全設計書 §8.3「Coordinator フロー」
 *
 * フロー:
 *   1. resolve enabled plugins
 *   2. build execution context
 *   3. for...of plugins (sequential, v1)
 *      a. execute one plugin with timeout
 *      b. normalize result
 *      c. append plugin status
 *   4. return aggregated runtime response
 *
 * v1 固定方針:
 *   - 並列実行なし（同一プロセス内逐次実行）
 *   - 全 plugin 失敗でもレスポンス構造を維持する
 *   - coordinator 自体が組み立て不能な場合は例外（→ 5xx）
 */

import { Injectable, Logger } from '@nestjs/common';
import { EnabledPluginsResolverService } from '../resolver/enabled-plugins-resolver.service';
import { ExecutionContextBuilderService } from '../context/execution-context-builder.service';
import { PluginExecutorService } from '../executor/plugin-executor.service';
import { ResultNormalizerService } from '../normalizer/result-normalizer.service';
import { PluginEventCaptureService } from '../event/plugin-event-capture.service';
import type { UserRole } from '@fxde/types';
import type {
  ChartPluginRuntimeResponse,
  RuntimeOverlay,
  RuntimeSignal,
  RuntimeIndicator,
  RuntimePluginStatus,
} from '@fxde/types';

@Injectable()
export class PluginRuntimeCoordinatorService {
  private readonly logger = new Logger(PluginRuntimeCoordinatorService.name);

  constructor(
    private readonly resolver:    EnabledPluginsResolverService,
    private readonly ctxBuilder:  ExecutionContextBuilderService,
    private readonly executor:    PluginExecutorService,
    private readonly normalizer:  ResultNormalizerService,
    private readonly eventCapture: PluginEventCaptureService,
  ) {}

  /**
   * Chart 向け Plugin Runtime の実行を総合調整し、結果を返す。
   */
  async runChartRuntime(params: {
    userId:    string;
    role:      UserRole;
    symbol:    string;
    timeframe: string;
  }): Promise<ChartPluginRuntimeResponse> {
    const { userId, role, symbol, timeframe } = params;
    const generatedAt = new Date().toISOString();

    // 1. 実行対象 plugin を解決
    const resolvedPlugins = await this.resolver.resolve(symbol, timeframe);

    this.logger.log(
      `Chart runtime: ${resolvedPlugins.length} plugin(s) resolved ` +
      `for ${symbol}/${timeframe}`,
    );

    // [DEBUG] 解決された plugin 一覧の詳細
    this.logger.debug('[PluginRuntimeCoordinator] resolved plugins', {
      count:   resolvedPlugins.length,
      plugins: resolvedPlugins.map((p) => ({
        pluginId:     p.pluginId,
        pluginKey:    p.pluginKey,
        capabilities: p.capabilities,
        timeoutMs:    p.timeoutMs,
        sortOrder:    p.sortOrder,
      })),
    });

    // 実行対象なしの場合は空レスポンスを返す
    if (resolvedPlugins.length === 0) {
      // [DEBUG] 0件の場合を明示
      this.logger.debug('[PluginRuntimeCoordinator] no plugins resolved → returning empty response');
      return {
        symbol,
        timeframe,
        generatedAt,
        overlays:       [],
        signals:        [],
        indicators:     [],
        pluginStatuses: [],
      };
    }

    // 2. 実行コンテキスト構築（共通コンテキストを一度だけ構築）
    const context = await this.ctxBuilder.build({
      userId,
      role,
      symbol,
      timeframe,
    });

    // 3. 各 plugin を逐次実行
    const allOverlays:    RuntimeOverlay[]     = [];
    const allSignals:     RuntimeSignal[]      = [];
    const allIndicators:  RuntimeIndicator[]   = [];
    const pluginStatuses: RuntimePluginStatus[] = [];

    for (const plugin of resolvedPlugins) {
      // [DEBUG] plugin 実行開始
      this.logger.debug('[PluginRuntimeCoordinator] executing plugin', {
        pluginKey: plugin.pluginKey,
        pluginId:  plugin.pluginId,
      });

      const result = await this.executor.execute(plugin, context);

      // [DEBUG] plugin 実行結果
      this.logger.debug('[PluginRuntimeCoordinator] plugin result', {
        pluginKey:    plugin.pluginKey,
        status:       result.status,
        rawOverlays:  result.status === 'SUCCEEDED' ? (result.raw?.overlays?.length  ?? 0) : 0,
        rawSignals:   result.status === 'SUCCEEDED' ? (result.raw?.signals?.length   ?? 0) : 0,
        rawIndicators:result.status === 'SUCCEEDED' ? (result.raw?.indicators?.length ?? 0) : 0,
        durationMs:   result.durationMs,
        ...(result.status === 'FAILED'  && { errorMessage: result.errorMessage }),
        ...(result.status === 'SKIPPED' && { reason: (result as { reason?: string }).reason }),
      });

      if (result.status === 'SUCCEEDED') {
        const normalized = this.normalizer.normalize(plugin.pluginKey, result.raw);
        allOverlays.push(...normalized.overlays);
        allSignals.push(...normalized.signals);
        allIndicators.push(...normalized.indicators);

        pluginStatuses.push({
          pluginId:     plugin.pluginId,
          pluginKey:    plugin.pluginKey,
          displayName:  plugin.displayName,
          status:       'SUCCEEDED',
          durationMs:   result.durationMs,
          errorMessage: null,
          capabilities: plugin.capabilities,
        });

        // Event capture（try/catch isolated — runtime 結果に影響しない）
        void this.eventCapture.captureSignalEvents(
          plugin.pluginKey,
          symbol,
          timeframe,
          normalized.signals,
        );
      } else if (result.status === 'FAILED') {
        pluginStatuses.push({
          pluginId:     plugin.pluginId,
          pluginKey:    plugin.pluginKey,
          displayName:  plugin.displayName,
          status:       'FAILED',
          durationMs:   result.durationMs,
          errorMessage: result.errorMessage,
          capabilities: plugin.capabilities,
        });
      } else if (result.status === 'TIMEOUT') {
        pluginStatuses.push({
          pluginId:     plugin.pluginId,
          pluginKey:    plugin.pluginKey,
          displayName:  plugin.displayName,
          status:       'TIMEOUT',
          durationMs:   result.durationMs,
          errorMessage: 'Plugin execution timed out',
          capabilities: plugin.capabilities,
        });
      } else {
        // SKIPPED
        pluginStatuses.push({
          pluginId:     plugin.pluginId,
          pluginKey:    plugin.pluginKey,
          displayName:  plugin.displayName,
          status:       'SKIPPED',
          durationMs:   0,
          errorMessage: (result as { reason?: string }).reason ?? null,
          capabilities: plugin.capabilities,
        });
      }
    }

    // [DEBUG] 最終集約結果
    this.logger.debug('[PluginRuntimeCoordinator] aggregated result', {
      overlays:      allOverlays.length,
      signals:       allSignals.length,
      indicators:    allIndicators.length,
      pluginStatuses: pluginStatuses.map((s) => ({
        pluginKey: s.pluginKey,
        status:    s.status,
      })),
    });

    return {
      symbol,
      timeframe,
      generatedAt,
      overlays:       allOverlays,
      signals:        allSignals,
      indicators:     allIndicators,
      pluginStatuses,
    };
  }
}