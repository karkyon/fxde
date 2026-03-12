/**
 * apps/api/src/jobs/prediction-dispatch.processor.ts
 *
 * 参照仕様:
 *   SPEC_v51_part4 §5.5「prediction-dispatch ワーカー（v5.1: スタブのみ）」
 *   SPEC_v51_part8 §9.2「v5.1 ジョブ処理フロー」
 *   SPEC_v51_part8 §9.3「STUB_PREDICTION_RESULT（固定返却データ）」
 *
 * v5.1 実装スコープ（Processor の責務）:
 *   1. PredictionJob.status = 'RUNNING' に更新
 *   2. PredictionWorker.runJob(jobId) に処理を委譲
 *   3. PredictionJob.status = 'SUCCEEDED' に更新
 *   ※ 失敗時は 'FAILED' に更新して再スロー
 *
 * 実装禁止（v6 設計資料）:
 *   DTW / HMM / 類似検索 / WFV / 重み自動学習
 *   これらは SPEC_v51_part8 §B（v6 設計資料）に保持されている。
 *
 * 【修正履歴】
 *   - [Task D] STUB_PREDICTION_RESULT の import 元を
 *     '../modules/predictions/predictions.service' → '@fxde/types' に変更
 *     理由: service → processor の逆流依存を解消
 *   - [round5 Task1] PredictionWorker への委譲に変更
 *     Processor はステータス管理のみ担当。
 *     フロー処理（MTF ローソク足ロード / 特徴量生成 / 推論 / 結果保存）は
 *     PredictionWorker.runJob() に委譲する。
 */

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger }                from '@nestjs/common';
import { Job }                   from 'bullmq';
import { PrismaService }         from '../prisma/prisma.service';
import { QUEUE_NAMES }           from './queues';
import { PredictionWorker }      from '../workers/prediction.worker';

// ── ジョブデータ型（SPEC_v51_part4 §5.2 正本）────────────────────────────────
export type PredictionDispatchJobData = {
  jobId: string;
};

@Processor(QUEUE_NAMES.PREDICTION_DISPATCH)
export class PredictionDispatchProcessor extends WorkerHost {
  private readonly logger = new Logger(PredictionDispatchProcessor.name);

  constructor(
    private readonly db:     PrismaService,
    private readonly predictionRunner: PredictionWorker,
  ) {
    super();
  }

  /**
   * v5.1 処理フロー（SPEC_v51_part8 §9.2）
   *
   * Processor の責務: ステータス管理（RUNNING / SUCCEEDED / FAILED）のみ。
   * フロー処理: PredictionWorker.runJob(jobId) に委譲。
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
      // ステップ 2: PredictionWorker に処理を委譲
      // フロー: loadMtfCandles → generateFeatures → runInference → saveResult
      await this.predictionRunner.runJob(jobId);

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