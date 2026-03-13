/**
 * apps/api/src/jobs/price-sync.processor.ts
 *
 * price-sync BullMQ Processor
 *
 * 参照仕様:
 *   SPEC_v51_part4 §5.1「price-sync: 5分ごと / 有効化された全シンボル × 主要時間足」
 *   SPEC_v51_part4 §5.3「price-sync ワーカー」
 */

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job }                   from 'bullmq';
import { Logger }                from '@nestjs/common';
import { QUEUE_NAMES, PriceSyncJobData } from './queues';
import { MarketDataService } from '../modules/market-data/market-data.service';

@Processor(QUEUE_NAMES.PRICE_SYNC)
export class PriceSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(PriceSyncProcessor.name);

  constructor(private readonly marketData: MarketDataService) {
    super();
  }

  async process(job: Job<PriceSyncJobData>): Promise<void> {
    const { symbol, timeframe } = job.data;
    this.logger.log(`price-sync job ${job.id}: ${symbol}/${timeframe}`);

    try {
      const count = await this.marketData.syncCandles(symbol, timeframe);
      this.logger.log(`price-sync 完了: ${symbol}/${timeframe} ${count}本`);
    } catch (err) {
      this.logger.error(`price-sync 失敗: ${symbol}/${timeframe} ${String(err)}`);
      throw err; // BullMQ retry へ
    }
  }
}