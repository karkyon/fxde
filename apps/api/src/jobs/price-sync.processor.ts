/**
 * apps/api/src/jobs/price-sync.processor.ts
 *
 * price-sync BullMQ Processor
 *
 * 参照仕様:
 *   SPEC_v51_part4 §5.1「price-sync: 5分ごと / 有効化された全シンボル × 主要時間足」
 *   SPEC_v51_part4 §5.3「price-sync ワーカー」
 *   SPEC_v51_part4 §5.4「snapshot-capture ワーカー」
 *
 * STEP 3 変更（2026-03-19）:
 *   - syncCandles 完了後に MarketDataService.syncIndicators() を呼ぶ
 *   - indicator_cache への書き込み経路を確立
 *
 * STEP 4 変更（2026-03-19）:
 *   - syncIndicators 完了後に SNAPSHOT_CAPTURE キューへ enqueue
 *   - 対象ユーザー: SymbolSetting.enabled = true のユーザー
 *   - 対象 TF: SNAPSHOT_TARGET_TIMEFRAMES（H4, D1）のみ
 *     理由: M5 等の高頻度 TF で全ユーザー分 snapshot を毎回生成するのは過負荷
 *   - PrismaService は @Global() モジュールのため直接 inject 可能
 *
 * 実行フロー:
 *   price-sync job
 *     → syncCandles() [candle upsert]
 *     → syncIndicators() [indicator_cache upsert]
 *     → enqueueSnapshotCapture() [H4/D1のみ]
 *         → SymbolSetting で enabled ユーザーを取得
 *         → SNAPSHOT_CAPTURE キューへ { userId, symbol, timeframe } を add
 *     → processor 完了
 *
 *   snapshot-capture job（別 processor で処理）
 *     → SnapshotsService.capture(userId, { symbol, timeframe })
 *     → indicator_cache から実値取得 → calculateScore() → DB 保存
 */

import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Job, Queue }  from 'bullmq';
import { Logger }      from '@nestjs/common';
import { QUEUE_NAMES, PriceSyncJobData, SnapshotCaptureJobData } from './queues';
import { MarketDataService } from '../modules/market-data/market-data.service';
import { PrismaService }     from '../prisma/prisma.service';
import type { Timeframe }    from '@fxde/types';

/** snapshot-capture を enqueue する対象の時間足 */
const SNAPSHOT_TARGET_TIMEFRAMES: Timeframe[] = ['H4', 'D1'];

@Processor(QUEUE_NAMES.PRICE_SYNC)
export class PriceSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(PriceSyncProcessor.name);

  constructor(
    private readonly marketData: MarketDataService,
    private readonly prisma:     PrismaService,
    @InjectQueue(QUEUE_NAMES.SNAPSHOT_CAPTURE)
    private readonly snapshotQueue: Queue<SnapshotCaptureJobData>,
  ) {
    super();
  }

  async process(job: Job<PriceSyncJobData>): Promise<void> {
    const { symbol, timeframe } = job.data;
    this.logger.log(`price-sync job ${job.id}: ${symbol}/${timeframe}`);

    try {
      // Step 1: candle 取得 → market_candles upsert
      const count = await this.marketData.syncCandles(symbol, timeframe);
      this.logger.log(`price-sync 完了: ${symbol}/${timeframe} ${count}本`);

      // Step 2: indicator 計算 → indicator_cache upsert
      await this.marketData.syncIndicators(symbol, timeframe);
      this.logger.debug(`indicator sync 完了: ${symbol}/${timeframe}`);

      // Step 3: SNAPSHOT_CAPTURE enqueue（対象 TF のみ）
      await this.enqueueSnapshotCapture(symbol, timeframe as Timeframe);

    } catch (err) {
      this.logger.error(`price-sync 失敗: ${symbol}/${timeframe} ${String(err)}`);
      throw err; // BullMQ retry へ
    }
  }

  /**
   * SNAPSHOT_CAPTURE を enabled ユーザー全員に enqueue する
   *
   * 対象: SNAPSHOT_TARGET_TIMEFRAMES（H4, D1）のみ
   * 理由: M5/M15 等の高頻度 TF では 5分ごとに全ユーザー分のスナップショットが
   *       生成されて過負荷になるため、代表的な上位足のみに絞る。
   *
   * jobId: `snapshot:${userId}:${symbol}:${timeframe}` で重複防止
   *   同一 userId × symbol × TF の job が既に pending なら skip される
   */
  private async enqueueSnapshotCapture(
    symbol:    string,
    timeframe: Timeframe,
  ): Promise<void> {
    if (!SNAPSHOT_TARGET_TIMEFRAMES.includes(timeframe)) return;

    // enabled = true のユーザーを取得
    const settings = await this.prisma.symbolSetting.findMany({
      where:  { symbol, enabled: true },
      select: { userId: true },
    });

    if (settings.length === 0) return;

    for (const { userId } of settings) {
      const jobId = `snapshot_${userId}_${symbol}_${timeframe}`;
      await this.snapshotQueue.add(
        'snapshot-capture',
        { userId, symbol, timeframe },
        {
          jobId,                            // 重複防止: 同 jobId が pending なら skip
          removeOnComplete: { count: 3 },
          removeOnFail:     { count: 5 },
        },
      );
    }

    this.logger.debug(
      `snapshot-capture enqueue: ${symbol}/${timeframe} → ${settings.length} ユーザー`,
    );
  }
}