/**
 * apps/api/src/modules/plugins-ranking/controller/plugins-ranking.controller.ts
 *
 * GET  /api/v1/plugins/reliability
 * GET  /api/v1/plugins/adaptive-ranking
 * GET  /api/v1/plugins/adaptive-ranking/stop-candidates
 * POST /api/v1/plugins/recompute
 *
 * 修正: getReliability() で service['prisma'] に直接アクセスしていた責務違反を修正。
 *       ReliabilityScoringService.findAll() 経由に変更。
 * 追加: POST /plugins/recompute — 手動リコンピュートジョブをキューに投入。
 */

import {
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { InjectQueue }               from '@nestjs/bullmq';
import { Queue }                     from 'bullmq';
import { ReliabilityScoringService } from '../service/reliability-scoring.service';
import { AdaptiveRankingService }    from '../service/adaptive-ranking.service';
import { GetPluginRankingQueryDto }  from '../dto/get-plugin-ranking.query.dto';
import { JwtAuthGuard }              from '../../../common/guards/jwt-auth.guard';
import { QUEUE_NAMES }               from '../../../jobs/queues';

@Controller('plugins')
@UseGuards(JwtAuthGuard)
export class PluginsRankingController {
  private readonly logger = new Logger(PluginsRankingController.name);

  constructor(
    private readonly reliabilityService: ReliabilityScoringService,
    private readonly rankingService:     AdaptiveRankingService,
    @InjectQueue(QUEUE_NAMES.PLUGIN_RELIABILITY_RECOMPUTE)
    private readonly recomputeQueue: Queue,
  ) {}

  /**
   * GET /api/v1/plugins/reliability
   * 全 plugin の信頼度スコア一覧
   */
  @Get('reliability')
  @HttpCode(HttpStatus.OK)
  async getReliability(@Query() query: GetPluginRankingQueryDto) {
    this.logger.debug('[PluginsRankingController] GET /plugins/reliability', query);

    // 修正: service['prisma'] 直接アクセス禁止 → findAll() 経由
    const rows = await this.reliabilityService.findAll({
      symbol:    query.symbol,
      timeframe: query.timeframe,
    });

    return rows.map((r) => ({
      id:               r.id,
      pluginKey:        r.pluginKey,
      symbol:           r.symbol,
      timeframe:        r.timeframe,
      sampleSize:       r.sampleSize,
      winRate:          r.winRate,
      expectancy:       r.expectancy,
      avgReturn:        r.avgReturn,
      avgMfe:           r.avgMfe,
      avgMae:           r.avgMae,
      reliabilityScore: r.reliabilityScore,
      stabilityScore:   r.stabilityScore,
      confidenceScore:  r.confidenceScore,
      state:            r.state,
      updatedAt:        r.updatedAt.toISOString(),
    }));
  }

  /**
   * GET /api/v1/plugins/adaptive-ranking
   * Plugin ランキング一覧（最新 decision）
   */
  @Get('adaptive-ranking')
  @HttpCode(HttpStatus.OK)
  async getAdaptiveRanking(@Query() query: GetPluginRankingQueryDto) {
    this.logger.debug('[PluginsRankingController] GET /plugins/adaptive-ranking', query);
    return this.rankingService.getRanking(query);
  }

  /**
   * GET /api/v1/plugins/adaptive-ranking/stop-candidates
   * 停止候補 plugin 一覧
   */
  @Get('adaptive-ranking/stop-candidates')
  @HttpCode(HttpStatus.OK)
  async getStopCandidates() {
    this.logger.debug('[PluginsRankingController] GET /plugins/adaptive-ranking/stop-candidates');
    return this.rankingService.getStopCandidates();
  }

  /**
   * POST /api/v1/plugins/recompute
   * 手動でリコンピュートジョブをキューに投入する。
   * ReliabilityLab UI の Recompute ボタンから呼び出される。
   */
  @Post('recompute')
  @HttpCode(HttpStatus.ACCEPTED)
  async recompute() {
    this.logger.log('[PluginsRankingController] POST /plugins/recompute — manual trigger');
    await this.recomputeQueue.add(
      'reliability-recompute',
      {},
      {
        removeOnComplete: { count: 5 },
        removeOnFail:     { count: 5 },
      },
    );
    return { status: 'queued' };
  }
}