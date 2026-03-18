/**
 * apps/api/src/jobs/price-sync.processor.ts
 *
 * price-sync BullMQ Processor
 *
 * 参照仕様:
 *   SPEC_v51_part4 §5.1「price-sync: 5分ごと / 有効化された全シンボル × 主要時間足」
 *   SPEC_v51_part4 §5.3「price-sync ワーカー」
 *
 * Phase 2 変更（Task2-1 対応）:
 *   - candle upsert 完了後に MarketDataService.syncIndicators() を呼ぶ
 *   - indicator_cache への書き込みはこの経路で行う
 *   - syncIndicators は syncCandles が 0 本の場合も呼ぶ
 *     （既存 candles から indicator を再計算するため）
 *
 * 設計原則:
 *   - indicator 計算ロジックはこの Processor に書かない（MarketDataService に委譲）
 *   - provider 差異はこの Processor が知らない（MarketDataService が吸収済み）
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
      // Step 1: candle 取得 → market_candles upsert
      const count = await this.marketData.syncCandles(symbol, timeframe);
      this.logger.log(`price-sync 完了: ${symbol}/${timeframe} ${count}本`);

      // Step 2: indicator 計算 → indicator_cache upsert
      // syncCandles が 0 本でも既存 DB データから indicator を再計算する
      await this.marketData.syncIndicators(symbol, timeframe);
      this.logger.debug(`indicator sync 完了: ${symbol}/${timeframe}`);

    } catch (err) {
      this.logger.error(`price-sync 失敗: ${symbol}/${timeframe} ${String(err)}`);
      throw err; // BullMQ retry へ
    }
  }
}