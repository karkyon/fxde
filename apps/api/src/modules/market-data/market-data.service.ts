/**
 * apps/api/src/modules/market-data/market-data.service.ts
 *
 * 市場データ取得・DB upsert サービス
 *
 * 参照仕様:
 *   SPEC_v51_part1 §8.1「コネクタ一覧」
 *   SPEC_v51_part4 §5.3「price-sync ワーカー」
 *   SPEC_v51_part11 §6「market_candles テーブル」
 *   FXDE_OANDA_TO_PROVIDER_ADAPTER_DETAILED_DESIGN §8
 *
 * Phase 1 変更:
 *   - OandaProvider 直接依存を削除
 *   - ProviderRegistry 経由で active provider を取得するよう変更
 *   - syncCandles / runBackfill / checkConnection のシグネチャは維持
 *   - upsert の source カラムは provider.providerId を使用
 *
 * Phase 1.5 変更:
 *   - runBackfill の count 固定 500 を provider.backfillCount(timeframe) 経由に変更
 *   - syncCandles の count も syncCount 定数で明示（意図を明確化）
 *   - isComplete !== false の確認を upsert 前に追加
 *     （CanonicalCandle.isComplete が明示的に false のバーは保存しない）
 *
 * 変更禁止:
 *   - メソッドシグネチャ（syncCandles / runBackfill / checkConnection）
 *   - 戻り値の型
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService }       from '../../prisma/prisma.service';
import { ProviderRegistry }    from './provider.registry';
import type { CanonicalTimeframe } from '@fxde/types';

// ── バックフィル対象（維持）──────────────────────────────────────────────
const BACKFILL_SYMBOLS    = ['EURUSD', 'USDJPY', 'GBPUSD'];
const BACKFILL_TIMEFRAMES: CanonicalTimeframe[] = [
  'M5', 'M15', 'M30', 'H1', 'H4', 'H8', 'D1', 'W1', 'MN',
];

/** 定期同期（syncCandles）での取得本数 */
const SYNC_COUNT = 100;

/**
 * 時間足 1 本あたりのミリ秒
 * syncCandles の fetchRange.from 計算に使用する
 */
const TF_MS: Record<string, number> = {
  M1:  60_000,
  M5:  5   * 60_000,
  M15: 15  * 60_000,
  M30: 30  * 60_000,
  H1:  60  * 60_000,
  H4:  4   * 60 * 60_000,
  H8:  8   * 60 * 60_000,
  D1:  24  * 60 * 60_000,
  W1:  7   * 24 * 60 * 60_000,
  MN:  30  * 24 * 60 * 60_000,
};

/**
 * 「最新 count 本」相当の from を計算する
 * 余裕係数 1.5: 週末・祝日・データ欠損を考慮した過去方向への余裕
 * OANDA は count ベース API のため本関数で range 変換する
 * Dukascopy（Phase 2）は date-range native なので本関数は不要になる
 */
function calcFrom(timeframe: string, count: number): string {
  const msPerBar = TF_MS[timeframe] ?? TF_MS['H1'];
  return new Date(Date.now() - msPerBar * count * 1.5).toISOString();
}

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class MarketDataService {
  private readonly logger = new Logger(MarketDataService.name);

  constructor(
    private readonly prisma:    PrismaService,
    private readonly registry:  ProviderRegistry,
  ) {}

  /**
   * 指定シンボル・時間足の最新 candles を active provider から取得して upsert
   * price-sync BullMQ Processor から呼び出す
   * シグネチャ維持: (symbol: string, timeframe: string) => Promise<number>
   */
  async syncCandles(symbol: string, timeframe: string): Promise<number> {
    const provider = this.registry.getActive();

    if (!provider.isConfigured()) {
      this.logger.debug(`[${provider.providerId}] 未設定 → ${symbol}/${timeframe} sync skip`);
      return 0;
    }

    const now  = new Date().toISOString();
    const from = calcFrom(timeframe, SYNC_COUNT);

    const candles = await provider.fetchRange({
      symbol,
      timeframe: timeframe as CanonicalTimeframe,
      from,
      to:    now,
      limit: SYNC_COUNT,
    });

    if (candles.length === 0) {
      this.logger.debug(`${symbol}/${timeframe}: candles 0件`);
      return 0;
    }

    let upserted = 0;
    for (const c of candles) {
      // Phase 1.5: isComplete が明示的に false のバーは保存しない
      if (c.isComplete === false) continue;

      await this.prisma.marketCandle.upsert({
        where: {
          symbol_timeframe_time: {
            symbol,
            timeframe: timeframe as never,
            time:      new Date(c.time),
          },
        },
        update: {
          open:   c.open,
          high:   c.high,
          low:    c.low,
          close:  c.close,
          volume: BigInt(c.volume ?? 0),
          source: provider.providerId,
        },
        create: {
          symbol,
          timeframe: timeframe as never,
          time:      new Date(c.time),
          open:      c.open,
          high:      c.high,
          low:       c.low,
          close:     c.close,
          volume:    BigInt(c.volume ?? 0),
          source:    provider.providerId,
        },
      });
      upserted++;
    }

    this.logger.log(`[${provider.providerId}] ${symbol}/${timeframe}: ${upserted}本 upsert 完了`);
    return upserted;
  }

  /**
   * 初回バックフィル
   * 3ペア × 9時間足 を順次実行
   * アプリ起動時 or 手動コマンドから呼び出す
   * シグネチャ維持: () => Promise<void>
   *
   * Phase 1.5 変更:
   *   count を 500 固定 → provider.backfillCount(timeframe) 経由に変更
   */
  async runBackfill(): Promise<void> {
    const provider = this.registry.getActive();

    if (!provider.isConfigured()) {
      this.logger.warn(`[${provider.providerId}] 未設定 → バックフィルをスキップ`);
      return;
    }

    this.logger.log(`[${provider.providerId}] バックフィル開始`);

    for (const symbol of BACKFILL_SYMBOLS) {
      for (const timeframe of BACKFILL_TIMEFRAMES) {
        try {
          // Phase 1.5: provider の特性に応じた本数を取得（固定 500 廃止）
          const count = provider.backfillCount(timeframe);
          const now   = new Date().toISOString();
          const from  = calcFrom(timeframe, count);

          const candles = await provider.fetchRange({
            symbol,
            timeframe,
            from,
            to:    now,
            limit: count,
          });

          let upserted = 0;
          for (const c of candles) {
            // Phase 1.5: isComplete が明示的に false のバーは保存しない
            if (c.isComplete === false) continue;

            await this.prisma.marketCandle.upsert({
              where: {
                symbol_timeframe_time: {
                  symbol,
                  timeframe: timeframe as never,
                  time:      new Date(c.time),
                },
              },
              update: {
                open:   c.open,
                high:   c.high,
                low:    c.low,
                close:  c.close,
                volume: BigInt(c.volume ?? 0),
                source: provider.providerId,
              },
              create: {
                symbol,
                timeframe: timeframe as never,
                time:      new Date(c.time),
                open:      c.open,
                high:      c.high,
                low:       c.low,
                close:     c.close,
                volume:    BigInt(c.volume ?? 0),
                source:    provider.providerId,
              },
            });
            upserted++;
          }

          this.logger.log(
            `[${provider.providerId}] バックフィル ${symbol}/${timeframe}: ${upserted}本 (count=${count})`,
          );

          // レート制限対策: 100ms待機
          await new Promise((r) => setTimeout(r, 100));

        } catch (err) {
          this.logger.error(
            `[${provider.providerId}] バックフィル失敗 ${symbol}/${timeframe}: ${String(err)}`,
          );
        }
      }
    }

    this.logger.log(`[${provider.providerId}] バックフィル完了`);
  }

  /**
   * Active provider の接続確認（connectors/status 用）
   * シグネチャ維持: () => Promise<{ ok: boolean; error?: string }>
   */
  async checkConnection(): Promise<{ ok: boolean; error?: string }> {
    const provider = this.registry.getActive();

    if (!provider.isConfigured()) {
      return { ok: false, error: 'unconfigured' };
    }
    try {
      const status = await provider.healthCheck();
      if (status === 'healthy') return { ok: true };
      return { ok: false, error: status };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }
}