/**
 * apps/api/src/modules/predictions/predictions.module.ts
 *
 * 変更内容:
 *   PredictionDispatchProcessor を providers に追加。
 *   Processor は BullMQ の @Processor デコレータを持つため、
 *   NestJS の DI コンテナに登録する必要がある。
 *
 * 参照仕様:
 *   SPEC_v51_part3 §10「Predictions API」
 *   SPEC_v51_part4 §5.1「キュー一覧」§5.5「prediction-dispatch ワーカー」
 *   SPEC_v51_part8 §9.1「v5.1 サービス構成（スタブのみ）」
 *
 * 登録内容:
 *   - PredictionsController（POST /jobs, GET /jobs/:id, GET /latest）
 *   - PredictionsService（ジョブ登録・状態確認・スタブ結果返却）
 *   - PredictionDispatchProcessor（v5.1 スタブ: 固定 JSON 書き込み）
 *   - BullMQModule.forFeature: prediction-dispatch キュー（イベント駆動・Cron なし）
 *
 * prediction-dispatch キューについて:
 *   Cron スケジュールを持たない。
 *   POST /predictions/jobs 受付時にのみ enqueue される。
 *   参照: SPEC_v51_part4 §5.7
 */

import { Module }         from '@nestjs/common';
import { BullModule }   from '@nestjs/bullmq';
import { PrismaModule }   from '../../prisma/prisma.module';
import { PredictionsController }        from './predictions.controller';
import { PredictionsService }           from './predictions.service';
import { PredictionDispatchProcessor }  from '../../jobs/prediction-dispatch.processor';
import { QUEUE_NAMES }                  from '../../jobs/queues';

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
    // v5.1 stub Processor（固定 JSON を PredictionResult に書き込む）
    // 参照: SPEC_v51_part4 §5.5 / SPEC_v51_part8 §9.2
    PredictionDispatchProcessor,
  ],
  exports: [PredictionsService],
})
export class PredictionsModule {}