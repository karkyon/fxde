/**
 * apps/api/src/modules/predictions/predictions.controller.ts
 *
 * 参照仕様:
 *   SPEC_v51_part3 §10「Predictions API」
 *   SPEC_v51_part10 §6.6「予測系エンドポイント（確定）」
 *   SPEC_v51_part4 §4.3「NestJS ガード実装パターン」
 *   SPEC_v51_part8 §2.3「PATCH /predictions/jobs/:id/tf-weights」
 *
 * エンドポイント:
 *   POST  /api/v1/predictions/jobs                    → 202 Accepted（PRO | PRO_PLUS | ADMIN）
 *   GET   /api/v1/predictions/jobs/:id                → 200（PRO | PRO_PLUS | ADMIN）
 *   GET   /api/v1/predictions/latest                  → 200（PRO | PRO_PLUS | ADMIN）
 *   PATCH /api/v1/predictions/jobs/:id/tf-weights     → 200（PRO | PRO_PLUS | ADMIN）
 *
 * 権限:
 *   全エンドポイントで PRO | PRO_PLUS | ADMIN のみ許可。
 *   参照: SPEC_v51_part4 §4.1 / SPEC_v51_part1 権限表現ルール
 */

import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { PredictionsService }  from './predictions.service';
import {
  CreatePredictionJobDto,
  GetPredictionLatestQueryDto,
  UpdateTfWeightsDto,
} from './dto/predictions.dto';
import { JwtAuthGuard }        from '../../common/guards/jwt-auth.guard';
import { RolesGuard }          from '../../common/guards/roles.guard';
import { Roles }               from '../../common/decorators/roles.decorator';
import { CurrentUser }         from '../../common/decorators/current-user.decorator';
import type { JwtPayload }     from '../../common/decorators/current-user.decorator';

@Controller('predictions')
@UseGuards(JwtAuthGuard, RolesGuard)
// 全エンドポイントで PRO | PRO_PLUS | ADMIN のみ許可
// 参照: SPEC_v51_part3 §10 / SPEC_v51_part4 §4.1
@Roles('PRO', 'PRO_PLUS', 'ADMIN')
export class PredictionsController {
  constructor(private readonly predictionsService: PredictionsService) {}

  /**
   * POST /api/v1/predictions/jobs
   * 予測ジョブ登録
   *
   * v5.1: symbol / timeframe のみ受付。
   * lookbackYears / minSimilarity / topK は v6 アルゴリズムパラメータのため非対応。
   * 登録後に BullMQ prediction-dispatch キューへ enqueue。
   *
   * → 202 Accepted: { jobId, status: 'QUEUED', estimatedSeconds }
   * 参照: SPEC_v51_part3 §10 CreateJobResponse
   */
  @Post('jobs')
  @HttpCode(HttpStatus.ACCEPTED) // 202
  createJob(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreatePredictionJobDto,
  ) {
    return this.predictionsService.createJob(user.sub, dto);
  }

  /**
   * GET /api/v1/predictions/jobs/:id
   * ジョブ状態確認（フロントは 5 秒ポーリング）
   *
   * status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED'
   * ⚠️ 'DONE' は使用禁止。Prisma enum JobStatus 準拠。
   * 参照: SPEC_v51_part3 §10 JobStatusResponse
   */
  @Get('jobs/:id')
  @HttpCode(HttpStatus.OK)
  getJobStatus(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.predictionsService.getJobStatus(user.sub, id);
  }

  /**
   * GET /api/v1/predictions/latest?symbol=EURUSD&timeframe=H4
   * 最新予測結果取得（v5.1: スタブ固定 JSON）
   *
   * クエリパラメータ:
   *   symbol    必須（例: EURUSD）
   *   timeframe 任意（例: H1）
   *
   * レスポンス: PredictionLatestResponse
   *   result.scenarios は DB の bull/neutral/bear オブジェクトを配列に変換して返す
   *   result.stub: true（v5.1 スタブ結果であることを明示）
   *
   * 参照: SPEC_v51_part3 §10 PredictionLatestResponse
   *       SPEC_v51_part10 §6.6
   */
  @Get('latest')
  @HttpCode(HttpStatus.OK)
  getLatest(
    @CurrentUser() user: JwtPayload,
    @Query() query: GetPredictionLatestQueryDto,
  ) {
    return this.predictionsService.getLatest(user.sub, query.symbol, query.timeframe);
  }

  /**
   * PATCH /api/v1/predictions/jobs/:id/tf-weights
   * TF 重みの上書き保存
   *
   * v5.1 で新規追加
   *
   * リクエストボディ: { weights: Partial<Record<Timeframe, number>> }
   *   各値は 0.05〜0.50 の範囲。サービス層で合計 1.0 に自動正規化。
   *   保存先: PredictionJob.requestData.tfWeights（マイグレーション不要）
   *
   * → 200 OK: { jobId, tfWeights, updatedAt }
   * 参照: SPEC_v51_part8 §2.3 / SPEC_v51_part10 §6.6
   */
  @Patch('jobs/:id/tf-weights')
  @HttpCode(HttpStatus.OK)
  updateTfWeights(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateTfWeightsDto,
  ) {
    return this.predictionsService.updateTfWeights(user.sub, id, dto);
  }
}