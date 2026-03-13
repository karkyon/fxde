/**
 * apps/api/src/modules/market-data/market-data.service.ts
 *
 * 市場データ取得・DB upsert サービス
 *
 * 参照仕様:
 *   SPEC_v51_part1 §8.1「コネクタ一覧」
 *   SPEC_v51_part4 §5.3「price-sync ワーカー」
 *   SPEC_v51_part11 §6「market_candles テーブル」
 *
 * 責務:
 *   - OandaProvider からローソク足を取得
 *   - market_candles テーブルへ upsert（@@unique[symbol, timeframe, time]）
 *   - バックフィル実行
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService }      from '../../prisma/prisma.service';
import { OandaProvider }      from './oanda.provider';

// バックフィル対象
const BACKFILL_SYMBOLS    = ['EURUSD', 'USDJPY', 'GBPUSD'];
const BACKFILL_TIMEFRAMES = ['M5', 'M15', 'M30', 'H1', 'H4', 'H8', 'D1', 'W1', 'MN'];

@Injectable()
export class MarketDataService {
  private readonly logger = new Logger(MarketDataService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly oanda:  OandaProvider,
  ) {}

  /**
   * 指定シンボル・時間足の最新 candles を OANDA から取得して upsert
   * price-sync BullMQ Processor から呼び出す
   */
  async syncCandles(symbol: string, timeframe: string): Promise<number> {
    if (!this.oanda.isConfigured()) {
      this.logger.debug(`OANDA 未設定 → ${symbol}/${timeframe} sync skip`);
      return 0;
    }

    const count   = 100; // 定期同期は最新100本
    const candles = await this.oanda.fetchCandles(symbol, timeframe, count);

    if (candles.length === 0) {
      this.logger.debug(`${symbol}/${timeframe}: candles 0件`);
      return 0;
    }

    let upserted = 0;
    for (const c of candles) {
      await this.prisma.marketCandle.upsert({
        where: {
          symbol_timeframe_time: {
            symbol,
            timeframe: timeframe as never,
            time: new Date(c.time),
          },
        },
        update: {
          open:   c.open,
          high:   c.high,
          low:    c.low,
          close:  c.close,
          volume: BigInt(c.volume),
          source: 'oanda',
        },
        create: {
          symbol,
          timeframe: timeframe as never,
          time:   new Date(c.time),
          open:   c.open,
          high:   c.high,
          low:    c.low,
          close:  c.close,
          volume: BigInt(c.volume),
          source: 'oanda',
        },
      });
      upserted++;
    }

    this.logger.log(`${symbol}/${timeframe}: ${upserted}本 upsert 完了`);
    return upserted;
  }

  /**
   * 初回バックフィル
   * 3ペア × 9時間足 を順次実行
   * アプリ起動時 or 手動コマンドから呼び出す
   */
  async runBackfill(): Promise<void> {
    if (!this.oanda.isConfigured()) {
      this.logger.warn('OANDA 未設定 → バックフィルをスキップ');
      return;
    }

    this.logger.log('バックフィル開始');

    for (const symbol of BACKFILL_SYMBOLS) {
      for (const timeframe of BACKFILL_TIMEFRAMES) {
        try {
          const count   = this.oanda.backfillCount(timeframe);
          const candles = await this.oanda.fetchCandles(symbol, timeframe, count);

          let upserted = 0;
          for (const c of candles) {
            await this.prisma.marketCandle.upsert({
              where: {
                symbol_timeframe_time: {
                  symbol,
                  timeframe: timeframe as never,
                  time: new Date(c.time),
                },
              },
              update: {
                open:   c.open,
                high:   c.high,
                low:    c.low,
                close:  c.close,
                volume: BigInt(c.volume),
                source: 'oanda',
              },
              create: {
                symbol,
                timeframe: timeframe as never,
                time:   new Date(c.time),
                open:   c.open,
                high:   c.high,
                low:    c.low,
                close:  c.close,
                volume: BigInt(c.volume),
                source: 'oanda',
              },
            });
            upserted++;
          }

          this.logger.log(`バックフィル ${symbol}/${timeframe}: ${upserted}本`);

          // レート制限対策: 100ms待機
          await new Promise((r) => setTimeout(r, 100));
        } catch (err) {
          this.logger.error(`バックフィル失敗 ${symbol}/${timeframe}: ${String(err)}`);
        }
      }
    }

    this.logger.log('バックフィル完了');
  }

  /** OANDA 接続確認（connectors/status 用） */
  async checkConnection(): Promise<{ ok: boolean; error?: string }> {
    if (!this.oanda.isConfigured()) {
      return { ok: false, error: 'unconfigured' };
    }
    try {
      await this.oanda.fetchCandles('EURUSD', 'H1', 1);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }
}