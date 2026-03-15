/**
 * apps/api/src/modules/plugins-ranking/service/plugin-event-evaluation.service.ts
 *
 * 未評価の PluginEvent に対して MarketCandle を参照し
 * PluginEventResult を保存する。
 * v1: signal event を対象。offset = 1, 3, 5, 10, 20 candle。
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService }      from '../../../prisma/prisma.service';

const EVAL_OFFSETS = [1, 3, 5, 10, 20] as const;

@Injectable()
export class PluginEventEvaluationService {
  private readonly logger = new Logger(PluginEventEvaluationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 未評価（PluginEventResult が存在しない）PluginEvent を評価する。
   * バッチ上限 100 件。
   */
  async evaluatePending(): Promise<number> {
    // 未評価 event を取得
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

    // emittedAt 以降のローソク足を offset 最大値 + 1 本取得
    const candles = await this.prisma.marketCandle.findMany({
      where: {
        symbol:    event.symbol,
        timeframe: event.timeframe as 'H4',  // Prisma enum
        time:      { gte: event.emittedAt },
      },
      orderBy: { time: 'asc' },
      take:    Math.max(...EVAL_OFFSETS) + 1,
    });

    if (candles.length < 2) return;  // データ不足

    const entryPrice = event.price;
    const direction  = event.direction as 'BUY' | 'SELL';

    const resultData: {
      eventId:      string;
      candleOffset: number;
      priceChange:  number;
      returnPct:    number;
      mfe:          number;
      mae:          number;
    }[] = [];

    for (const offset of EVAL_OFFSETS) {
      if (candles.length <= offset) continue;

      const targetCandle = candles[offset];
      const closePrice   = Number(targetCandle.close);

      const priceChange = direction === 'BUY'
        ? closePrice - entryPrice
        : entryPrice - closePrice;

      const returnPct = priceChange / entryPrice;

      // MFE / MAE: offset までの区間での最大/最小
      const rangeCandles = candles.slice(0, offset + 1);
      let mfe = 0;
      let mae = 0;

      for (const c of rangeCandles) {
        const high = Number(c.high);
        const low  = Number(c.low);
        const favExcursion = direction === 'BUY'
          ? (high - entryPrice) / entryPrice
          : (entryPrice - low)  / entryPrice;
        const advExcursion = direction === 'BUY'
          ? (entryPrice - low)  / entryPrice
          : (high - entryPrice) / entryPrice;

        if (favExcursion > mfe) mfe = favExcursion;
        if (advExcursion > mae) mae = advExcursion;
      }

      resultData.push({
        eventId:      event.id,
        candleOffset: offset,
        priceChange,
        returnPct,
        mfe,
        mae,
      });
    }

    if (resultData.length > 0) {
      await this.prisma.pluginEventResult.createMany({ data: resultData });
    }
  }
}