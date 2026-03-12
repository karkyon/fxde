/**
 * apps/api/src/jobs/ai-summary-sync.processor.ts
 *
 * 参照仕様: SPEC_v51_part4 §5.6「ai-summary-sync ワーカー」
 *
 * 役割: snapshot-capture 完了時などに自動 enqueue されるバックグラウンド処理。
 *       POST /api/v1/ai-summary の同期フローとは別系統。
 *       BullMQ attempts: 3 / backoff: exponential（SPEC §5.8）
 */

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job }                   from 'bullmq';
import { Logger }                from '@nestjs/common';
import { PrismaService }         from '../prisma/prisma.service';
import { AiSummaryService }      from '../ai-summary/ai-summary.service';
import { QUEUE_NAMES, AiSummarySyncJobData } from './queues';
import Redis from 'ioredis';

@Processor(QUEUE_NAMES.AI_SUMMARY_SYNC)
export class AiSummarySyncProcessor extends WorkerHost {
  private readonly logger = new Logger(AiSummarySyncProcessor.name);
  private readonly redis: Redis;

  constructor(
    private readonly db:      PrismaService,
    private readonly summary: AiSummaryService,
  ) {
    super();
    this.redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
  }

  async process(job: Job<AiSummarySyncJobData>): Promise<void> {
    const { userId, snapshotId } = job.data;
    this.logger.log(`Processing ai-summary-sync job ${job.id} for snapshot ${snapshotId}`);

    const snapshot = await this.db.snapshot.findUniqueOrThrow({
      where: { id: snapshotId },
    });

    const text = await this.summary.generateAiSummaryForJob(snapshot);

    // Redis キャッシュ（TTL 1時間）
    const cacheKey = `ai-summary:${userId}:${snapshot.symbol}`;
    await this.redis.set(cacheKey, text, 'EX', 3600).catch((e) => {
      this.logger.warn(`Redis cache set failed: ${String(e)}`);
    });

    // DB upsert（SPEC §5.6）
    await this.db.aiSummary.upsert({
      where:  { userId_symbol: { userId, symbol: snapshot.symbol } },
      update: { text, updatedAt: new Date() },
      create: { userId, symbol: snapshot.symbol, text },
    });

    this.logger.log(`ai-summary-sync job ${job.id} completed`);
  }
}