/**
 * apps/api/src/jobs/market-data-jobs.module.ts
 *
 * price-sync パイプラインの NestJS モジュール。
 *
 * 登録内容:
 *   - BullModule.registerQueue: price-sync キュー
 *   - PriceSyncProcessor: price-sync ジョブを処理する BullMQ Processor
 *   - MarketDataSchedulerService: 起動時 backfill + 5分 cron を enqueue
 *
 * 依存:
 *   - MarketDataModule（MarketDataService を inject するため）
 *
 * 参照仕様: SPEC_v51_part4 §5.1「price-sync キュー」§5.3「price-sync ワーカー」
 */
import { Module }            from '@nestjs/common';
import { BullModule }        from '@nestjs/bullmq';
import { MarketDataModule }  from '../modules/market-data/market-data.module';
import { QUEUE_NAMES }       from './queues';
import { PriceSyncProcessor }         from './price-sync.processor';
import { MarketDataSchedulerService } from './market-data-scheduler.service';

@Module({
  imports: [
    MarketDataModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.PRICE_SYNC }),
  ],
  providers: [
    PriceSyncProcessor,
    MarketDataSchedulerService,
  ],
})
export class MarketDataJobsModule {}