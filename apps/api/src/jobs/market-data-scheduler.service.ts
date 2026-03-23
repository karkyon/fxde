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
    // 起動時 backfill: 8秒間隔で順次投入（Twelve Data 8 req/min 対応）
    // delay なし一斉投入すると 9件目以降 rate limit → 0本取得 → 異常 indicator 計算が走る
    const BACKFILL_INTERVAL_MS = 8_000; // 7.5秒/req に余裕を持って8秒

    let delayMs = 0;
    for (const symbol of SYMBOLS) {
      for (const timeframe of TIMEFRAMES) {
        await this.priceQueue.add(
          'price-sync',
          { symbol, timeframe },
          {
            jobId:            `backfill:${symbol}:${timeframe}`,
            delay:            delayMs,
            removeOnComplete: { count: 1 },
            removeOnFail:     { count: 5 },
          },
        );
        delayMs += BACKFILL_INTERVAL_MS;
      }
    }
    this.logger.log(
      `起動時バックフィルジョブ投入: ${SYMBOLS.length}ペア × ${TIMEFRAMES.length}TF` +
      ` (${delayMs / 1000}秒かけて順次実行)`,
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