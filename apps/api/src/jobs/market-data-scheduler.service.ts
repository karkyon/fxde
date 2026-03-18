/**
 * apps/api/src/jobs/market-data-scheduler.service.ts
 *
 * price-sync キューへ定期ジョブを登録するスケジューラ
 * 5分ごと / 対象: EURUSD・USDJPY・GBPUSD × M5/M15/M30/H1/H4/H8/D1
 *
 * 参照仕様: SPEC_v51_part4 §5.1 §5.7
 *
 * 修正内容（Bug 2 対応）:
 *   旧: cron-dispatch ジョブに空データ {} を送信 → processor が symbol/timeframe=undefined で起動
 *   新: 各 symbol × timeframe ごとに個別の repeating job を登録する
 *       起動時 backfill も同様に個別登録（jobId で重複防止）
 */

import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectQueue }  from '@nestjs/bullmq';
import { Queue }        from 'bullmq';
import { QUEUE_NAMES }  from './queues';
import type { Timeframe } from '@fxde/types';

const SYMBOLS:     string[]     = ['EURUSD', 'USDJPY', 'GBPUSD'];
const TIMEFRAMES:  Timeframe[]  = ['M5', 'M15', 'M30', 'H1', 'H4', 'H8', 'D1'];

@Injectable()
export class MarketDataSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(MarketDataSchedulerService.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.PRICE_SYNC)
    private readonly priceQueue: Queue,
  ) {}

  async onModuleInit() {
    // ── 起動時 backfill: 各 symbol × timeframe を即時 enqueue ─────────────
    // jobId で重複防止（既に同 jobId のジョブが pending なら skip）
    for (const symbol of SYMBOLS) {
      for (const timeframe of TIMEFRAMES) {
        await this.priceQueue.add(
          'price-sync',
          { symbol, timeframe },
          {
            jobId:            `backfill:${symbol}:${timeframe}`,
            removeOnComplete: { count: 1 },
            removeOnFail:     { count: 5 },
          },
        );
      }
    }
    this.logger.log(
      `起動時バックフィルジョブ投入: ${SYMBOLS.length}ペア × ${TIMEFRAMES.length}TF`,
    );

    // ── 5分ごとの repeating job: 各 symbol × timeframe に個別登録 ──────────
    // BullMQ のrepeating jobは repeat オプション付き add() で登録する。
    // 旧実装の cron-dispatch（空データ {} を送信）は廃止。
    // symbol/timeframe を含む正しいデータを各ジョブに付与する。
    for (const symbol of SYMBOLS) {
      for (const timeframe of TIMEFRAMES) {
        await this.priceQueue.add(
          'price-sync',
          { symbol, timeframe },
          {
            repeat:           { every: 5 * 60 * 1000 },
            removeOnComplete: { count: 10 },
            removeOnFail:     { count: 5 },
          },
        );
      }
    }
    this.logger.log(
      `price-sync cron 登録完了: ${SYMBOLS.length}ペア × ${TIMEFRAMES.length}TF × 5分間隔`,
    );
  }
}