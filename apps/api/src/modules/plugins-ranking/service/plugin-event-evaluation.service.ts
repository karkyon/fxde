/**
 * apps/api/src/modules/plugins-ranking/service/plugin-event-evaluation.service.ts
 *
 * 未評価の PluginEvent に対して MarketCandle を参照し
 * PluginEventResult を保存する。
 * v1: signal event を対象。offset = 1, 3, 5, 10, 20 candle。
 *
 * 修正: timeframe as 'H4' 固定キャストを削除。
 *       mapTimeframeToPrismaEnum() で String → Prisma Timeframe enum に安全変換。
 */

import { Injectable, Logger } from '@nestjs/common';
import { Prisma, Timeframe }  from '@prisma/client';
import { PrismaService }      from '../../../prisma/prisma.service';

const EVAL_OFFSETS = [1, 3, 5, 10, 20] as const;

/** pip サイズ取得（JPY ペア = 0.01、それ以外 = 0.0001）*/
function getPipSize(symbol: string): number {
  return symbol.toUpperCase().endsWith('JPY') ? 0.01 : 0.0001;
}

/** Prisma Timeframe enum の有効値セット */
const VALID_TIMEFRAMES: ReadonlySet<string> = new Set<Timeframe>([
  'M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'H8', 'D1', 'W1', 'MN',
]);

/**
 * PluginEvent.timeframe (string) を Prisma Timeframe enum に変換する。
 * 不正値の場合は null を返す（評価スキップ）。
 */
function mapTimeframeToPrismaEnum(value: string): Timeframe | null {
  if (VALID_TIMEFRAMES.has(value)) {
    return value as Timeframe;
  }
  return null;
}

@Injectable()
export class PluginEventEvaluationService {
  private readonly logger = new Logger(PluginEventEvaluationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 未評価（PluginEventResult が存在しない）PluginEvent を評価する。
   * バッチ上限 100 件。
   */
  async evaluatePending(): Promise<number> {
    const events = await this.prisma.pluginEvent.findMany({
      where: {
        eventType: 'signal',
        results:   { none: {} },
      },
      orderBy: { emittedAt: 'asc' },
      take:    100,
    });

    if (events.length === 0) {
      this.logger.debug('[EventEvaluation] no pending events');
      return 0;
    }

    let evaluated = 0;

    for (const event of events) {
      try {
        await this._evaluateOne(event);
        evaluated++;
      } catch (err) {
        this.logger.warn(
          `[EventEvaluation] failed event ${event.id}: ${String(err)}`,
        );
      }
    }

    this.logger.log(`[EventEvaluation] evaluated ${evaluated}/${events.length} events`);
    return evaluated;
  }

  private async _evaluateOne(event: {
    id:        string;
    pluginKey: string;
    symbol:    string;
    timeframe: string;
    direction: string | null;
    price:     number | null;
    emittedAt: Date;
  }): Promise<void> {
    if (!event.price || !event.direction || event.direction === 'NEUTRAL') return;

    // 修正: 固定キャスト as 'H4' を削除 → 安全な Enum 変換
    const timeframe = mapTimeframeToPrismaEnum(event.timeframe);
    if (timeframe === null) {
      this.logger.warn(
        `[EventEvaluation] unknown timeframe "${event.timeframe}" for event ${event.id}, skip`,
      );
      return;
    }

    const candles = await this.prisma.marketCandle.findMany({
      where: {
        symbol:    event.symbol,
        timeframe,                          // Timeframe enum（型安全）
        time:      { gte: event.emittedAt },
      },
      orderBy: { time: 'asc' },
      take:    Math.max(...EVAL_OFFSETS) + 1,
    });

    if (candles.length < 2) return;

    const entryPrice = event.price;
    const direction  = event.direction as 'BUY' | 'SELL';

    const resultData: {
      eventId:      string;
      candleOffset: number;
      priceChange:  number;
      returnPct:    number;
      mfe:          number;
      mae:          number;
      resultPips:   number;
    }[] = [];

    for (const offset of EVAL_OFFSETS) {
      if (candles.length <= offset) continue;

      const targetCandle = candles[offset];
      const closePrice   = Number(targetCandle.close);

      const priceChange = direction === 'BUY'
        ? closePrice - entryPrice
        : entryPrice - closePrice;

      const returnPct = priceChange / entryPrice;

      // MFE / MAE: offset 範囲内の high/low から計算
      const window = candles.slice(1, offset + 1);
      const highs  = window.map((c) => Number(c.high));
      const lows   = window.map((c) => Number(c.low));

      const mfe = direction === 'BUY'
        ? Math.max(...highs) - entryPrice
        : entryPrice - Math.min(...lows);

      const mae = direction === 'BUY'
        ? entryPrice - Math.min(...lows)
        : Math.max(...highs) - entryPrice;

      resultData.push({
        eventId:      event.id,
        candleOffset: offset,
        priceChange,
        returnPct,
        mfe:  Math.max(0, mfe),
        mae:  Math.max(0, mae),
        resultPips: Math.round((priceChange / getPipSize(event.symbol)) * 10) / 10,
      });
    }

    if (resultData.length === 0) return;

    await this.prisma.pluginEventResult.createMany({ data: resultData });

    this.logger.debug(
      `[EventEvaluation] saved ${resultData.length} result(s) for event ${event.id}`,
    );
  }
}