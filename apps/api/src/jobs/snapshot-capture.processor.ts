/**
 * apps/api/src/jobs/snapshot-capture.processor.ts
 *
 * snapshot-capture BullMQ Processor
 *
 * 参照仕様:
 *   SPEC_v51_part4 §5.4「snapshot-capture ワーカー」
 *   SPEC_v51_part4 §5.1「キュー一覧: SNAPSHOT_CAPTURE」
 *
 * 役割:
 *   - SNAPSHOT_CAPTURE キューから { userId, symbol, timeframe } を受け取る
 *   - SnapshotsService.capture() を呼んで snapshot を生成・保存する
 *   - indicator_cache が存在すれば実値スコアが計算される
 *     （snapshots.service 側で indicator_cache を読む責務を持つ）
 *
 * 設計原則:
 *   - indicator 計算はここで行わない（indicator_cache 経由で読む）
 *   - provider はここから呼ばない
 *   - processor の責務はキュー受信と SnapshotsService への委譲のみ
 *
 * enqueue 元:
 *   price-sync.processor.ts の Step 3（H4/D1 のみ）
 */

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job }                   from 'bullmq';
import { Logger }                from '@nestjs/common';
import { QUEUE_NAMES, SnapshotCaptureJobData } from './queues';
import { SnapshotsService } from '../modules/snapshots/snapshots.service';

@Processor(QUEUE_NAMES.SNAPSHOT_CAPTURE)
export class SnapshotCaptureProcessor extends WorkerHost {
  private readonly logger = new Logger(SnapshotCaptureProcessor.name);

  constructor(private readonly snapshotsService: SnapshotsService) {
    super();
  }

  async process(job: Job<SnapshotCaptureJobData>): Promise<void> {
    const { userId, symbol, timeframe } = job.data;
    this.logger.log(
      `snapshot-capture job ${job.id}: userId=${userId} ${symbol}/${timeframe}`,
    );

    try {
      const snapshot = await this.snapshotsService.capture(userId, {
        symbol,
        timeframe,
      });

      this.logger.log(
        `snapshot-capture 完了: job=${job.id} snapshotId=${snapshot.id} ` +
        `score=${snapshot.scoreTotal} state=${snapshot.entryState}`,
      );
    } catch (err) {
      this.logger.error(
        `snapshot-capture 失敗: job=${job.id} ${symbol}/${timeframe}: ${String(err)}`,
      );
      throw err; // BullMQ retry へ
    }
  }
}