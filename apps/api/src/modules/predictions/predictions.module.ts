/**
 * apps/api/src/modules/predictions/predictions.module.ts
 *
 * 依存関係:
 *   PredictionDispatchProcessor → PredictionWorker → PredictionsService
 *                                                    → PrismaService（global）
 *
 * 参照仕様:
 *   SPEC_v51_part3 §10「Predictions API」
 *   SPEC_v51_part4 §5.1「キュー一覧」§5.5「prediction-dispatch ワーカー」
 *   SPEC_v51_part8 §9.1「v5.1 サービス構成（スタブのみ）」
 *
 * 登録内容:
 *   - PredictionsController（POST /jobs, GET /jobs/:id, GET /latest, PATCH /jobs/:id/tf-weights）
 *   - PredictionsService（ジョブ登録・状態確認・スタブ結果返却・generatePrediction）
 *   - PredictionWorker（フロー処理: MTF ローソク足 / 特徴量 / 推論 / 保存）
 *   - PredictionDispatchProcessor（ステータス管理・PredictionWorker 委譲）
 *   - BullMQModule.forFeature: prediction-dispatch キュー（イベント駆動・Cron なし）
 */

import { Module }          from '@nestjs/common';
import { BullModule }      from '@nestjs/bullmq';
import { PrismaModule }    from '../../prisma/prisma.module';
import { PredictionsController }       from './predictions.controller';
import { PredictionsService }          from './predictions.service';
import { PredictionWorker }            from '../../workers/prediction.worker';
import { PredictionDispatchProcessor } from '../../jobs/prediction-dispatch.processor';
import { QUEUE_NAMES }                 from '../../jobs/queues';

@Module({
  imports: [
    PrismaModule,
    // prediction-dispatch キューの inject を有効化
    // 参照: SPEC_v51_part4 §5.1 QUEUE_NAMES.PREDICTION_DISPATCH = 'prediction-dispatch'
    BullModule.registerQueue({ name: QUEUE_NAMES.PREDICTION_DISPATCH }),
  ],
  controllers: [PredictionsController],
  providers: [
    PredictionsService,
    // PredictionWorker: フロー処理を担うヘルパー
    // PredictionsService + PrismaService を注入して使用する。
    PredictionWorker,
    // v5.1 Processor（ステータス管理 + PredictionWorker への委譲）
    // 参照: SPEC_v51_part4 §5.5 / SPEC_v51_part8 §9.2
    PredictionDispatchProcessor,
  ],
  exports: [PredictionsService],
})
export class PredictionsModule {}