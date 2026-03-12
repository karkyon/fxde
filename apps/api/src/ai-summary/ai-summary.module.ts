/**
 * apps/api/src/ai-summary/ai-summary.module.ts
 *
 * 参照仕様: SPEC_v51_part4 §6「AI 市場要約機能」
 *
 * 登録内容:
 *   - AiSummaryController（POST / GET）
 *   - AiSummaryService（Claude API 呼び出し・レート制限・DB 保存）
 *   - AiSummarySyncProcessor（BullMQ Processor）
 *   - BullMQModule.forFeature: ai-summary-sync キュー
 */

import { Module }       from '@nestjs/common';
import { BullModule }   from '@nestjs/bullmq';
import { PrismaModule } from '../prisma/prisma.module';
import { AiSummaryController }     from './ai-summary.controller';
import { AiSummaryService }        from './ai-summary.service';
import { AiSummarySyncProcessor }  from '../jobs/ai-summary-sync.processor';
import { QUEUE_NAMES }             from '../jobs/queues';

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.AI_SUMMARY_SYNC }),
  ],
  controllers: [AiSummaryController],
  providers: [
    AiSummaryService,
    AiSummarySyncProcessor,
  ],
  exports: [AiSummaryService],
})
export class AiSummaryModule {}