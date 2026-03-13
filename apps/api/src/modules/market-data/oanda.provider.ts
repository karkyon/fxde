/**
 * apps/api/src/modules/market-data/oanda.provider.ts
 *
 * OANDA v20 REST API クライアント（副系 price provider）
 *
 * 参照仕様:
 *   SPEC_v51_part1 §8.1 oanda: FX価格OHLC（副）/ isRequired=false
 *   SPEC_v51_part1 §8.3 フォールバック戦略
 *
 * 役割:
 *   - OANDA Practice/Live API から candles を取得
 *   - FXDE Timeframe → OANDA granularity 変換
 *   - EURUSD → EUR_USD symbol 変換
 *   - 未設定時は unconfigured 扱い（503 を投げない・静かに skip）
 */

import { Injectable, Logger } from '@nestjs/common';

// FXDE Timeframe → OANDA granularity 変換テーブル
const GRANULARITY_MAP: Record<string, string> = {
  M1:  'M1',
  M5:  'M5',
  M15: 'M15',
  M30: 'M30',
  H1:  'H1',
  H4:  'H4',
  H8:  'H8',
  D1:  'D',
  W1:  'W',
  MN:  'M',
};

// バックフィル本数
const BACKFILL_COUNT: Record<string, number> = {
  M5: 500, M15: 500, M30: 500,
  H1: 500, H4:  500, H8:  500,
  D1: 500, W1:  300, MN:  200,
};

export interface OandaCandle {
  time:   string;   // ISO 8601
  open:   number;
  high:   number;
  low:    number;
  close:  number;
  volume: number;
}

@Injectable()
export class OandaProvider {
  private readonly logger = new Logger(OandaProvider.name);

  private get apiKey():     string | undefined { return process.env.OANDA_API_KEY; }
  private get accountId():  string | undefined { return process.env.OANDA_ACCOUNT_ID; }
  private get baseUrl():    string {
    // Practice デフォルト
    return process.env.OANDA_API_URL ?? 'https://api-fxpractice.oanda.com';
  }

  /** 設定済みか */
  isConfigured(): boolean {
    return !!(this.apiKey && this.accountId);
  }

  /** FXDE symbol → OANDA instrument（EURUSD → EUR_USD） */
  toInstrument(symbol: string): string {
    if (symbol.length === 6) {
      return `${symbol.slice(0, 3)}_${symbol.slice(3)}`;
    }
    return symbol;
  }

  /** candles 取得（最新 count 本） */
  async fetchCandles(
    symbol:    string,
    timeframe: string,
    count:     number,
  ): Promise<OandaCandle[]> {
    if (!this.isConfigured()) {
      this.logger.warn('OANDA_API_KEY / OANDA_ACCOUNT_ID 未設定 → skip');
      return [];
    }

    const instrument  = this.toInstrument(symbol);
    const granularity = GRANULARITY_MAP[timeframe];
    if (!granularity) {
      this.logger.warn(`未対応 timeframe: ${timeframe}`);
      return [];
    }

    const url = `${this.baseUrl}/v3/instruments/${instrument}/candles` +
      `?count=${count}&granularity=${granularity}&price=M`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`OANDA API error ${res.status}: ${body}`);
    }

    const json = await res.json() as {
      candles: Array<{
        time:     string;
        volume:   number;
        complete: boolean;
        mid: { o: string; h: string; l: string; c: string };
      }>;
    };

    return (json.candles ?? [])
      .filter((c) => c.complete)
      .map((c) => ({
        time:   c.time,
        open:   parseFloat(c.mid.o),
        high:   parseFloat(c.mid.h),
        low:    parseFloat(c.mid.l),
        close:  parseFloat(c.mid.c),
        volume: c.volume,
      }));
  }

  /** バックフィル用の本数を返す */
  backfillCount(timeframe: string): number {
    return BACKFILL_COUNT[timeframe] ?? 500;
  }
}