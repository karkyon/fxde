/**
 * apps/api/src/modules/plugins-ranking/jobs/reliability-recompute.job.ts
 *
 * BullMQ Processor: plugin-reliability-recompute キュー
 * 5 分ごとの repeatable job として動作する。
 *
 * フロー:
 *   1. evaluatePending() — 未評価 PluginEvent に ResultResult を付与
 *   2. recompute()       — PluginReliability を更新
 *   3. runRanking()      — PluginAdaptiveDecision を更新
 */

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnModuleInit }  from '@nestjs/common';
import { InjectQueue }           from '@nestjs/bullmq';
import { Job, Queue }            from 'bullmq';
import { QUEUE_NAMES }           from '../../../jobs/queues';
import { PluginEventEvaluationService } from '../service/plugin-event-evaluation.service';
import { ReliabilityScoringService }    from '../service/reliability-scoring.service';
import { AdaptiveRankingService }       from '../service/adaptive-ranking.service';

@Processor(QUEUE_NAMES.PLUGIN_RELIABILITY_RECOMPUTE)
export class ReliabilityRecomputeJob extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(ReliabilityRecomputeJob.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.PLUGIN_RELIABILITY_RECOMPUTE)
    private readonly recomputeQueue: Queue,
    private readonly evaluationService: PluginEventEvaluationService,
    private readonly scoringService:    ReliabilityScoringService,
    private readonly rankingService:    AdaptiveRankingService,
  ) {
    super();
  }

  /** アプリ起動時に repeatable job を登録する */
  async onModuleInit(): Promise<void> {
    await this.recomputeQueue.add(
      'reliability-recompute',
      {},
      {
        repeat:      { every: 5 * 60 * 1000 },  // 5 分
        removeOnComplete: { count: 10 },
        removeOnFail:     { count: 5 },
      },
    );
    this.logger.log('[ReliabilityRecomputeJob] repeatable job registered (every 5 min)');
  }

  async process(_job: Job): Promise<void> {
    this.logger.log('[ReliabilityRecomputeJob] starting recompute cycle');

    // Step 1: 未評価 event → PluginEventResult 保存
    const evaluated = await this.evaluationService.evaluatePending();
    this.logger.log(`[ReliabilityRecomputeJob] evaluated ${evaluated} event(s)`);

    // Step 2: PluginReliability 更新
    await this.scoringService.recompute();
    this.logger.log('[ReliabilityRecomputeJob] reliability recomputed');

    // Step 3: PluginAdaptiveDecision 更新
    await this.rankingService.runRanking();
    this.logger.log('[ReliabilityRecomputeJob] adaptive ranking updated');
  }
}