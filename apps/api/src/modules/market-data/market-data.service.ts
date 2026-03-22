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
 *
 * STEP 3 変更（2026-03-19）:
 *   - IndicatorEngineService を inject
 *   - syncIndicators(symbol, timeframe) を追加
 *     取得順: orderBy time DESC + take N → reverse() で昇順変換
 *     理由: ASC + take N では最古 N 本を取得してしまう。
 *           DESC で最新 N 本を取得してから reverse() で昇順にして
 *           indicator-engine に渡すことで「最新 N 本での計算」を保証する。
 *
 * 変更禁止:
 *   - メソッドシグネチャ（syncCandles / runBackfill / checkConnection / getCandles）
 *   - 戻り値の型
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService }       from '../../prisma/prisma.service';
import { ProviderRegistry }    from './provider.registry';
import { IndicatorEngineService } from './indicator-engine.service';
import type { CanonicalTimeframe, CanonicalCandle } from '@fxde/types';

// ── バックフィル対象（維持）──────────────────────────────────────────────
const BACKFILL_SYMBOLS    = ['EURUSD', 'USDJPY', 'GBPUSD'];
const BACKFILL_TIMEFRAMES: CanonicalTimeframe[] = [
  'M5', 'M15', 'M30', 'H1', 'H4', 'H8', 'D1', 'W1', 'MN',
];

/** 定期同期（syncCandles）での取得本数 */
const SYNC_COUNT = 100;

/**
 * indicator 計算に使用する market_candles 取得本数
 * MA200 に 200 本 + 余裕 50 本 = 250 本
 */
const INDICATOR_CANDLE_COUNT = 250;

/** 時間足 1 本あたりのミリ秒 */
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
    private readonly prisma:          PrismaService,
    private readonly registry:        ProviderRegistry,
    private readonly indicatorEngine: IndicatorEngineService,
  ) {}

  // ── syncCandles ──────────────────────────────────────────────────────────

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

  // ── syncIndicators ───────────────────────────────────────────────────────

  /**
   * 指定シンボル・時間足の indicator を計算して indicator_cache に upsert
   *
   * STEP 3 修正内容（candle 取得順バグ修正）:
   *
   *   旧（バグあり）:
   *     orderBy: { time: 'asc' }, take: N
   *     → DB の最古 N 本を取得してしまう
   *     → MA200 計算に最新データが使われず、indicator が全て過去データベースになる
   *
   *   新（正）:
   *     orderBy: { time: 'desc' }, take: N → reverse()
   *     → DB の最新 N 本を DESC で取得
   *     → reverse() で昇順（古→新）に並び替えて indicator-engine に渡す
   *     → MA200・RSI・MACD・ATR・BB が全て「最新 N 本」で計算される
   *
   * シグネチャ: (symbol: string, timeframe: string) => Promise<void>
   */
  async syncIndicators(symbol: string, timeframe: string): Promise<void> {
    // DESC で最新 N 本を取得 → reverse() で昇順（古→新）に変換
    const dbCandles = await this.prisma.marketCandle.findMany({
      where:   { symbol, timeframe: timeframe as never },
      orderBy: { time: 'desc' },   // ← 最新側から取得
      take:    INDICATOR_CANDLE_COUNT,
    });

    if (dbCandles.length === 0) {
      this.logger.debug(`[IndicatorSync] ${symbol}/${timeframe}: candles 0件 → skip`);
      return;
    }

    // reverse(): DESC で取得した配列を昇順（古→新）に変換
    // indicator-engine は昇順データを期待する（最後の要素が最新）
    const ascCandles = [...dbCandles].reverse();

    // Prisma Decimal → number 変換
    const inputCandles = ascCandles.map((c) => ({
      open:  Number(c.open),
      high:  Number(c.high),
      low:   Number(c.low),
      close: Number(c.close),
    }));

    const indicators = this.indicatorEngine.calculate(inputCandles);

    // indicator_cache upsert（symbol × timeframe で 1 レコードを維持）
    const now    = new Date();
    const source = this.registry.getActive().providerId;

    const existing = await this.prisma.indicatorCache.findFirst({
      where:   { symbol, timeframe: timeframe as never },
      orderBy: { calculatedAt: 'desc' },
    });

    if (existing) {
      await this.prisma.indicatorCache.update({
        where: { id: existing.id },
        data: {
          calculatedAt: now,
          indicators:   indicators as never,
          source,
        },
      });
    } else {
      await this.prisma.indicatorCache.create({
        data: {
          symbol,
          timeframe:    timeframe as never,
          calculatedAt: now,
          indicators:   indicators as never,
          source,
        },
      });
    }

    this.logger.debug(
      `[IndicatorSync] ${symbol}/${timeframe}: ` +
      `RSI=${indicators.rsi.value.toFixed(1)} ` +
      `MA=${indicators.ma.status} ` +
      `MACD=${indicators.macd.crossStatus} ` +
      `(n=${inputCandles.length}本)`,
    );
  }

  // ── runBackfill ──────────────────────────────────────────────────────────

  /**
   * 初回バックフィル
   * シグネチャ維持: () => Promise<void>
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

  // ── backfillRangeCandles ─────────────────────────────────────────────────

  /**
   * 指定期間・シンボル・時間足の candles を backfill して market_candles に保存
   * admin backfill endpoint から呼ぶ
   *
   * Twelve Data 5000本/req 制限対応:
   *   期間が長い場合は window 分割して複数回 fetchRange を呼ぶ
   */
  async backfillRangeCandles(params: {
    symbol:    string;
    timeframe: CanonicalTimeframe;
    startDate: string;  // ISO8601
    endDate:   string;  // ISO8601
  }): Promise<{ upserted: number; windows: number }> {
    const provider = this.registry.getActive();

    if (!provider.isConfigured()) {
      this.logger.warn(`[backfill] provider 未設定 → skip`);
      return { upserted: 0, windows: 0 };
    }

    const { symbol, timeframe, startDate, endDate } = params;
    const tfMs      = TF_MS[timeframe] ?? TF_MS['H1'];
    const MAX_BARS  = 4500; // 5000 上限に余裕を持たせる
    const windowMs  = tfMs * MAX_BARS;

    const startMs = new Date(startDate).getTime();
    const endMs   = new Date(endDate).getTime();

    let upserted = 0;
    let windows  = 0;
    let curStart = startMs;

    while (curStart < endMs) {
      const curEnd = Math.min(curStart + windowMs, endMs);

      this.logger.log(
        `[backfill] ${symbol}/${timeframe} window ${windows + 1}: ` +
        `${new Date(curStart).toISOString()} → ${new Date(curEnd).toISOString()}`,
      );

      try {
        const candles = await provider.fetchRange({
          symbol,
          timeframe,
          from:  new Date(curStart).toISOString(),
          to:    new Date(curEnd).toISOString(),
          limit: MAX_BARS,
        });

        for (const c of candles) {
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
          `[backfill] window ${windows + 1} 完了: ${candles.filter(c => c.isComplete !== false).length}本 upsert`,
        );
      } catch (err) {
        this.logger.error(
          `[backfill] window ${windows + 1} 失敗: ${String(err)}`,
        );
      }

      windows++;
      curStart = curEnd;

      // Rate limit 対応: window 間に 1.5秒 wait（Twelve Data 8 req/min free tier）
      if (curStart < endMs) {
        await new Promise((r) => setTimeout(r, 1500));
      }
    }

    this.logger.log(
      `[backfill] ${symbol}/${timeframe} 完了: ${upserted}本 (${windows} windows)`,
    );

    return { upserted, windows };
  }

  // ── getCandles ───────────────────────────────────────────────────────────

  /**
   * Chart API 向け candle 取得
   * シグネチャ維持: (symbol, timeframe, limit) => Promise<CanonicalCandle[]>
   */
  async getCandles(
    symbol:    string,
    timeframe: string,
    limit:     number,
  ): Promise<CanonicalCandle[]> {
    const provider = this.registry.getActive();

    // Chart API 向け candle 取得は market_candles テーブルを参照する。
    // 理由: Dukascopy 等 provider が空レスポンスを返す場合でも、
    //       syncCandles() / runBackfill() によって既に DB に保存されたデータを返す。
    // provider.fetchRange() の直接呼び出しは syncCandles / runBackfill でのみ行う。
    const dbCandles = await this.prisma.marketCandle.findMany({
      where:   { symbol, timeframe: timeframe as never },
      orderBy: { time: 'desc' },
      take:    limit,
    });

    if (dbCandles.length === 0) {
      this.logger.debug(
        `[${provider.providerId}] getCandles DB empty ${symbol}/${timeframe}`,
      );
      return [];
    }

    // DESC で取得 → 昇順（古→新）に変換してから返す
    const asc = [...dbCandles].reverse();

    return asc.map((c) => ({
      provider:    provider.providerId,
      symbol,
      timeframe:   timeframe as CanonicalTimeframe,
      time:        c.time.toISOString(),
      open:        Number(c.open),
      high:        Number(c.high),
      low:         Number(c.low),
      close:       Number(c.close),
      volume:      Number(c.volume),
      isComplete:  true,
    }));
  }

  // ── checkConnection ──────────────────────────────────────────────────────

  /**
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