/**
 * apps/api/src/jobs/prediction-dispatch.processor.ts
 *
 * 参照仕様:
 *   SPEC_v51_part4 §5.5「prediction-dispatch ワーカー（v5.1: スタブのみ）」
 *   SPEC_v51_part8 §9.2「v5.1 ジョブ処理フロー（固定 JSON）」
 *   SPEC_v51_part8 §9.3「STUB_PREDICTION_RESULT（固定返却データ）」
 *
 * v5.1 実装スコープ:
 *   1. PredictionJob.status = 'RUNNING' に更新
 *   2. STUB_PREDICTION_RESULT（固定 JSON）を PredictionResult に upsert
 *   3. PredictionJob.status = 'SUCCEEDED' に更新
 *   ※ 失敗時は 'FAILED' に更新して再スロー
 *
 * 実装禁止（v6 設計資料）:
 *   DTW / HMM / 類似検索 / WFV / 重み自動学習
 *   これらは SPEC_v51_part8 §B（v6 設計資料）に保持されている。
 */

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger }                from '@nestjs/common';
import { Job }                   from 'bullmq';
import { PrismaService }         from '../prisma/prisma.service';
import { QUEUE_NAMES }           from './queues';
import { STUB_PREDICTION_RESULT } from '../modules/predictions/predictions.service';

// ── ジョブデータ型（SPEC_v51_part4 §5.2 正本）────────────────────────────────
export type PredictionDispatchJobData = {
  jobId: string;
};

@Processor(QUEUE_NAMES.PREDICTION_DISPATCH)
export class PredictionDispatchProcessor extends WorkerHost {
  private readonly logger = new Logger(PredictionDispatchProcessor.name);

  constructor(private readonly db: PrismaService) {
    super();
  }

  /**
   * v5.1 stub 処理フロー（SPEC_v51_part8 §9.2）
   *
   * 1. RUNNING に更新
   * 2. 固定 JSON を PredictionResult に upsert
   * 3. SUCCEEDED に更新
   *
   * 性能要件: 全体 < 3 秒（SPEC_v51_part8 §9.4）
   */
  async process(job: Job<PredictionDispatchJobData>): Promise<void> {
    const { jobId } = job.data;
    this.logger.log(`prediction-dispatch start jobId=${jobId}`);

    // ステップ 1: RUNNING に更新
    await this.db.predictionJob.update({
      where: { id: jobId },
      data:  { status: 'RUNNING', startedAt: new Date() },
    });

    try {
      // ステップ 2: 固定 JSON を PredictionResult に upsert
      // STUB_PREDICTION_RESULT は predictions.service.ts から import
      // Part8 §9.3 の shape に準拠（bull/neutral/bear キーのオブジェクト型）
      await this.db.predictionResult.upsert({
        where:  { jobId },
        update: { resultData: STUB_PREDICTION_RESULT as object },
        create: { jobId,    resultData: STUB_PREDICTION_RESULT as object },
      });

      // ステップ 3: SUCCEEDED に更新
      await this.db.predictionJob.update({
        where: { id: jobId },
        data:  { status: 'SUCCEEDED', finishedAt: new Date() },
      });

      this.logger.log(`prediction-dispatch succeeded jobId=${jobId}`);
    } catch (error) {
      // 失敗時: FAILED に更新して再スロー（BullMQ リトライに委ねる）
      await this.db.predictionJob.update({
        where: { id: jobId },
        data: {
          status:       'FAILED',
          finishedAt:   new Date(),
          errorMessage: String(error),
        },
      });
      this.logger.error(`prediction-dispatch failed jobId=${jobId}`, error);
      throw error;
    }
  }
}