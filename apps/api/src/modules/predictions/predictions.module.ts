/**
 * apps/api/src/modules/predictions/predictions.module.ts
 *
 * 参照仕様:
 *   SPEC_v51_part3 §10「Predictions API」
 *   SPEC_v51_part4 §5.1「キュー一覧」§5.5「prediction-dispatch ワーカー」
 *
 * 登録内容:
 *   - PredictionsController（POST /jobs, GET /jobs/:id, GET /latest）
 *   - PredictionsService（ジョブ登録・状態確認・スタブ結果返却）
 *   - BullMQModule.forFeature: prediction-dispatch キュー（イベント駆動・Cron なし）
 *
 * prediction-dispatch キューについて:
 *   Cron スケジュールを持たない。
 *   POST /predictions/jobs 受付時にのみ enqueue される。
 *   参照: SPEC_v51_part4 §5.7
 *     > prediction-dispatch キューは Cron スケジュールを持たない。
 *     > 予測ジョブは POST /api/v1/predictions/jobs のリクエスト受付時にイベント駆動で enqueue される。
 */

import { Module }         from '@nestjs/common';
import { BullMQModule }   from '@nestjs/bullmq';
import { PrismaModule }   from '../../prisma/prisma.module';
import { PredictionsController } from './predictions.controller';
import { PredictionsService }    from './predictions.service';
import { QUEUE_NAMES }           from '../../jobs/queues';

@Module({
  imports: [
    PrismaModule,
    // prediction-dispatch キューの inject を有効化
    // 参照: SPEC_v51_part4 §5.1 QUEUE_NAMES.PREDICTION_DISPATCH = 'prediction-dispatch'
    BullMQModule.forFeature([{ name: QUEUE_NAMES.PREDICTION_DISPATCH }]),
  ],
  controllers: [PredictionsController],
  providers:   [PredictionsService],
  exports:     [PredictionsService],
})
export class PredictionsModule {}