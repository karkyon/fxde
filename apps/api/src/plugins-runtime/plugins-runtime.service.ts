/**
 * apps/api/src/plugins-runtime/plugins-runtime.service.ts
 *
 * PluginsRuntimeModule のメインサービス。
 * Controller → Coordinator への橋渡しをする。
 *
 * 参照仕様:
 *   fxde_plugin_runtime_完全設計書 §8.1「配置」
 */

import { Injectable } from '@nestjs/common';
import { PluginRuntimeCoordinatorService } from './coordinator/plugin-runtime-coordinator.service';
import type { ChartPluginRuntimeResponse, UserRole } from '@fxde/types';

@Injectable()
export class PluginsRuntimeService {
  constructor(
    private readonly coordinator: PluginRuntimeCoordinatorService,
  ) {}

  async getChartRuntime(params: {
    userId:    string;
    role:      UserRole;
    symbol:    string;
    timeframe: string;
  }): Promise<ChartPluginRuntimeResponse> {
    return this.coordinator.runChartRuntime(params);
  }
}