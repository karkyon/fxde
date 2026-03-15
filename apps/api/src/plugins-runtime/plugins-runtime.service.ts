/**
 * apps/api/src/plugins-runtime/plugins-runtime.service.ts
 *
 * PluginsRuntimeModule のメインサービス。
 * Controller → Coordinator への橋渡しをする。
 *
 * 参照仕様:
 *   fxde_plugin_runtime_完全設計書 §8.1「配置」
 */

import { Injectable, Logger } from '@nestjs/common'; // [DEBUG] Logger 追加
import { PluginRuntimeCoordinatorService } from './coordinator/plugin-runtime-coordinator.service';
import type { ChartPluginRuntimeResponse, UserRole } from '@fxde/types';

@Injectable()
export class PluginsRuntimeService {
  // [DEBUG] logger 追加
  private readonly logger = new Logger(PluginsRuntimeService.name);

  constructor(
    private readonly coordinator: PluginRuntimeCoordinatorService,
  ) {}

  async getChartRuntime(params: {
    userId:    string;
    role:      UserRole;
    symbol:    string;
    timeframe: string;
  }): Promise<ChartPluginRuntimeResponse> {
    // [DEBUG] 開始ログ
    this.logger.debug('[PluginsRuntimeService] getChartRuntime start', {
      symbol:    params.symbol,
      timeframe: params.timeframe,
      userId:    params.userId,
    });

    const result = await this.coordinator.runChartRuntime(params);

    // [DEBUG] 戻り値サマリー
    this.logger.debug('[PluginsRuntimeService] getChartRuntime result', {
      overlays:      result.overlays.length,
      signals:       result.signals.length,
      indicators:    result.indicators.length,
      pluginStatuses: result.pluginStatuses.length,
    });

    return result;
  }
}