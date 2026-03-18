/**
 * apps/api/src/plugins-runtime/context/execution-context-builder.service.ts
 */

import { Injectable, Logger } from '@nestjs/common';
import { ChartService } from '../../modules/chart/chart.service';
import type { UserRole, Timeframe } from '@fxde/types';
import type { PluginExecutionContext } from '../types/plugin-execution-context';

// 上位足マッピング（condition-context-engine と同一定義）
const HTF_MAP: Record<string, string> = {
  M1:  'M5',
  M5:  'M15',
  M15: 'H1',
  M30: 'H1',
  H1:  'H4',
  H4:  'D1',
  H8:  'D1',
  D1:  'W1',
  W1:  'MN',
  MN:  'MN',
};

@Injectable()
export class ExecutionContextBuilderService {
  private readonly logger = new Logger(ExecutionContextBuilderService.name);

  constructor(private readonly chartService: ChartService) {}

  async build(params: {
    userId:    string;
    role:      UserRole;
    symbol:    string;
    timeframe: string;
  }): Promise<PluginExecutionContext> {
    const { userId, role, symbol, timeframe } = params;

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

    // 上位足 candles 取得（higherTrend 算出用）
    // 取得失敗しても runtime には影響しない（try/catch で吸収）
    let higherCandles: PluginExecutionContext['higherCandles'] = undefined;
    const htf = HTF_MAP[timeframe];
    if (htf && htf !== timeframe) {
      try {
        const htfResponse = await this.chartService.getCandles({
          symbol,
          timeframe: htf as Timeframe,
          limit: 100,
        });
        higherCandles = htfResponse.candles;
        this.logger.debug(
          `[ExecutionContextBuilder] HTF candles fetched: ${symbol}/${htf} n=${higherCandles?.length}`,
        );
      } catch (err) {
        // 上位足取得失敗は higherTrend=unknown に自然に落ちる。runtime を止めない。
        this.logger.warn(
          `[ExecutionContextBuilder] HTF candles fetch failed for ${symbol}/${htf}: ${String(err)}`,
        );
      }
    }

    return {
      userId,
      role,
      symbol,
      timeframe,
      nowIso:            new Date().toISOString(),
      candles:           candlesResponse.candles,
      higherCandles,
      indicators:        indicatorsResponse.indicators as unknown as Record<string, unknown> | null,
      patternMarkers:    [],
      activeTrades:      [],
      predictionOverlay: null,
    };
  }
}