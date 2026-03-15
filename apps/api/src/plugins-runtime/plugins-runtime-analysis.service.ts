/**
 * apps/api/src/plugins-runtime/plugins-runtime-analysis.service.ts
 *
 * Analysis Runtime サービス。
 * Chart Runtime と同構造で、同一 Coordinator を再利用する。
 *
 * 参照仕様:
 *   fxde_plugin_runtime_完全設計書 §4「Phase4 Analysis Runtime」
 *   fxde_plugin_runtime_完全設計書 §8.1「配置」
 *
 * v1 方針:
 *   - chart runtime と同じ Coordinator フローで実行する
 *   - 将来的に analysis 専用 capability フィルタ追加可能な構造にしておく
 *   - Analysis Runtime は signal / indicator を主目的とする（overlay は副次的）
 */

import { Injectable, Logger } from '@nestjs/common';
import { PluginRuntimeCoordinatorService } from './coordinator/plugin-runtime-coordinator.service';
import type { ChartPluginRuntimeResponse, UserRole } from '@fxde/types';

@Injectable()
export class PluginsRuntimeAnalysisService {
  // [DEBUG] logger 追加
  private readonly logger = new Logger(PluginsRuntimeAnalysisService.name);

  constructor(
    private readonly coordinator: PluginRuntimeCoordinatorService,
  ) {}

  async getAnalysisRuntime(params: {
    userId:    string;
    role:      UserRole;
    symbol:    string;
    timeframe: string;
  }): Promise<ChartPluginRuntimeResponse> {
    // [DEBUG] 開始ログ
    this.logger.debug('[PluginsRuntimeAnalysisService] getAnalysisRuntime start', {
      symbol:    params.symbol,
      timeframe: params.timeframe,
      userId:    params.userId,
    });

    // v1: chart runtime と同一 coordinator を再利用
    const result = await this.coordinator.runChartRuntime(params);

    // [DEBUG] 戻り値サマリー
    this.logger.debug('[PluginsRuntimeAnalysisService] getAnalysisRuntime result', {
      overlays:       result.overlays.length,
      signals:        result.signals.length,
      indicators:     result.indicators.length,
      pluginStatuses: result.pluginStatuses.length,
    });

    return result;
  }
}