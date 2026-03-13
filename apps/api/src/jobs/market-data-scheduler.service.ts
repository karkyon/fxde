/**
 * apps/api/src/jobs/market-data-scheduler.service.ts
 *
 * price-sync キューへ定期ジョブを登録するスケジューラ
 * 5分ごと / 対象: EURUSD・USDJPY・GBPUSD × M5/M15/M30/H1/H4/H8/D1
 *
 * 参照仕様: SPEC_v51_part4 §5.1 §5.7
 */

import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectQueue }  from '@nestjs/bullmq';
import { Queue }        from 'bullmq';
import { QUEUE_NAMES }  from './queues';
import type { Timeframe } from '@fxde/types';

const SYMBOLS:     string[]     = ['EURUSD', 'USDJPY', 'GBPUSD'];
const TIMEFRAMES:  Timeframe[]  = ['M5', 'M15', 'M30', 'H1', 'H4', 'H8', 'D1'];

@Injectable()
export class MarketDataSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(MarketDataSchedulerService.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.PRICE_SYNC)
    private readonly priceQueue: Queue,
  ) {}

  async onModuleInit() {
    // 5分ごとに全シンボル×時間足の price-sync を enqueue
    await this.priceQueue.add(
      'cron-dispatch',
      {},
      { repeat: { every: 5 * 60 * 1000 } },
    );
    this.logger.log('price-sync cron 登録完了（5分間隔）');

    // 起動時に即時 backfill job をキューへ投入
    for (const symbol of SYMBOLS) {
      for (const timeframe of TIMEFRAMES) {
        await this.priceQueue.add(
          'price-sync',
          { symbol, timeframe },
          { jobId: `backfill:${symbol}:${timeframe}` },
        );
      }
    }
    this.logger.log(`起動時バックフィルジョブ投入: ${SYMBOLS.length}ペア × ${TIMEFRAMES.length}TF`);
  }
}