/**
 * apps/api/src/plugins-runtime/context/execution-context-builder.service.ts
 */

import { Injectable } from '@nestjs/common';
import { ChartService } from '../../modules/chart/chart.service';
import type { UserRole, Timeframe } from '@fxde/types';
import type { PluginExecutionContext } from '../types/plugin-execution-context';

@Injectable()
export class ExecutionContextBuilderService {
  constructor(private readonly chartService: ChartService) {}

  async build(params: {
    userId:    string;
    role:      UserRole;
    symbol:    string;
    timeframe: string;
  }): Promise<PluginExecutionContext> {
    const { userId, role, symbol, timeframe } = params;

    // string → Timeframe キャスト（Zod で上流検証済み）
    const tf = timeframe as Timeframe;

    const candlesResponse = await this.chartService.getCandles({
      symbol,
      timeframe: tf,
      limit: 100,
    });

    const indicatorsResponse = await this.chartService.getIndicators({
      symbol,
      timeframe: tf,
    });

    return {
      userId,
      role,
      symbol,
      timeframe,
      nowIso:            new Date().toISOString(),
      candles:           candlesResponse.candles,
      indicators:        indicatorsResponse.indicators as Record<string, unknown>,
      patternMarkers:    [],
      activeTrades:      [],
      predictionOverlay: null,
    };
  }
}