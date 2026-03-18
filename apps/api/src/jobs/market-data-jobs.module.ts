/**
 * apps/api/src/jobs/market-data-jobs.module.ts
 *
 * price-sync + snapshot-capture パイプラインの NestJS モジュール。
 *
 * 登録内容:
 *   - BullModule.registerQueue: price-sync キュー
 *   - BullModule.registerQueue: snapshot-capture キュー（Phase 2 追加）
 *   - PriceSyncProcessor: price-sync ジョブを処理する BullMQ Processor
 *   - MarketDataSchedulerService: 起動時 backfill + 5分 cron を enqueue
 *   - SnapshotCaptureProcessor: snapshot-capture ジョブを処理する BullMQ Processor（Phase 2 追加）
 *
 * 依存:
 *   - MarketDataModule（MarketDataService を inject するため）
 *   - SnapshotsModule（SnapshotsService を inject するため）（Phase 2 追加）
 *
 * 参照仕様:
 *   SPEC_v51_part4 §5.1「price-sync キュー」§5.3「price-sync ワーカー」
 *   SPEC_v51_part4 §5.4「snapshot-capture ワーカー」
 */
import { Module }            from '@nestjs/common';
import { BullModule }        from '@nestjs/bullmq';
import { MarketDataModule }  from '../modules/market-data/market-data.module';
import { SnapshotsModule }   from '../modules/snapshots/snapshots.module';  // Phase 2 追加
import { QUEUE_NAMES }       from './queues';
import { PriceSyncProcessor }         from './price-sync.processor';
import { MarketDataSchedulerService } from './market-data-scheduler.service';
import { SnapshotCaptureProcessor }   from './snapshot-capture.processor';  // Phase 2 追加

@Module({
  imports: [
    MarketDataModule,
    SnapshotsModule,   // Phase 2 追加: SnapshotCaptureProcessor が SnapshotsService を inject するため
    BullModule.registerQueue({ name: QUEUE_NAMES.PRICE_SYNC }),
    BullModule.registerQueue({ name: QUEUE_NAMES.SNAPSHOT_CAPTURE }),  // Phase 2 追加
  ],
  providers: [
    PriceSyncProcessor,
    MarketDataSchedulerService,
    SnapshotCaptureProcessor,  // Phase 2 追加
  ],
})
export class MarketDataJobsModule {}