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
 *   - SNAPSHOT_CAPTURE キューからジョブを取り出す
 *   - SnapshotsService.capture() を呼んで snapshot を生成・保存する
 *   - 非同期経路での snapshot 生成を担当
 *     （同期経路: POST /api/v1/snapshots/capture → controller → service 直接）
 *
 * v5.1 実装範囲:
 *   - キューからの { userId, symbol, timeframe } を受け取り capture() を実行
 *   - 生成された snapshot ID をジョブログに記録
 *   - 失敗時は BullMQ リトライに委ねる
 *
 * 設計原則:
 *   - indicator 計算はここで行わない（SnapshotsService → indicator_cache 経由）
 *   - provider はここから呼ばない
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
        `score=${snapshot.scoreTotal} entryState=${snapshot.entryState}`,
      );
    } catch (err) {
      this.logger.error(
        `snapshot-capture 失敗: job=${job.id} userId=${userId} ${symbol}/${timeframe}: ${String(err)}`,
      );
      throw err; // BullMQ retry へ
    }
  }
}