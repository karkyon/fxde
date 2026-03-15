/**
 * apps/api/src/modules/plugins-ranking/plugins-ranking.module.ts
 *
 * Adaptive Plugin Ranking Engine モジュール。
 * 既存 plugins-runtime は変更せず、横に積む設計。
 */

import { Module }       from '@nestjs/common';
import { BullModule }   from '@nestjs/bullmq';
import { PrismaModule } from '../../prisma/prisma.module';
import { QUEUE_NAMES }  from '../../jobs/queues';

import { PluginsRankingController }      from './controller/plugins-ranking.controller';
import { ReliabilityScoringService }     from './service/reliability-scoring.service';
import { AdaptiveRankingService }        from './service/adaptive-ranking.service';
import { PluginEventEvaluationService }  from './service/plugin-event-evaluation.service';
import { ReliabilityRecomputeJob }       from './jobs/reliability-recompute.job';

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue({
      name: QUEUE_NAMES.PLUGIN_RELIABILITY_RECOMPUTE,
    }),
  ],
  controllers: [PluginsRankingController],
  providers: [
    ReliabilityScoringService,
    AdaptiveRankingService,
    PluginEventEvaluationService,
    ReliabilityRecomputeJob,
  ],
})
export class PluginsRankingModule {}