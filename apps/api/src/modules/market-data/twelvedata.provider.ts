/**
 * apps/api/src/modules/market-data/twelvedata.provider.ts
 *
 * Twelve Data 公式 API provider（主系 price provider）
 *
 * 参照:
 *   https://twelvedata.com/docs#time-series
 *   SPEC_v51_part1 §8.1（公式 API 限定）
 *
 * 使用エンドポイント: GET /time_series
 *   params: symbol / interval / start_date / end_date / outputsize / apikey
 *   max outputsize: 5000 per request
 *
 * FXDE Timeframe → Twelve Data interval 変換:
 *   M5  → 5min  / M15 → 15min / M30 → 30min
 *   H1  → 1h    / H4  → 4h    / H8  → 8h
 *   D1  → 1day  / W1  → 1week / MN  → 1month
 *
 * symbol 変換: EURUSD → EUR/USD
 *
 * レスポンス形式:
 *   { meta: {...}, values: [{ datetime: "YYYY-MM-DD HH:mm:ss", open, high, low, close }] }
 *   - datetime は UTC
 *   - 降順（最新が先頭）
 *   - volume なし → null で返す
 *
 * 環境変数:
 *   TWELVEDATA_API_KEY  必須（未設定時は unconfigured）
 *   TWELVEDATA_BASE_URL 省略時: https://api.twelvedata.com
 */

import { Injectable, Logger } from '@nestjs/common';
import type { MarketProviderId, CanonicalCandle, CanonicalTimeframe } from '@fxde/types';
import type {
  MarketDataProvider,
  FetchLatestBarInput,
  FetchRangeInput,
  ProviderHealthStatus,
} from './market-data-provider.interface';

// ── FXDE Timeframe → Twelve Data interval 変換テーブル ───────────────────
const INTERVAL_MAP: Record<string, string> = {
  M5:  '5min',
  M15: '15min',
  M30: '30min',
  H1:  '1h',
  H4:  '4h',
  H8:  '8h',
  D1:  '1day',
  W1:  '1week',
  MN:  '1month',
};

// ── 時間足 1 本あたりのミリ秒（isComplete 判定用）───────────────────────
const TF_MS: Record<string, number> = {
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

// ── バックフィル本数（時間足別）──────────────────────────────────────────
const BACKFILL_COUNT: Record<string, number> = {
  M5:  500,
  M15: 500,
  M30: 1000,
  H1:  2000,
  H4:  2000,
  H8:  1000,
  D1:  1000,
  W1:  500,
  MN:  200,
};

// ── Twelve Data raw 型 ───────────────────────────────────────────────────
interface TwelveDataBar {
  datetime: string;  // "YYYY-MM-DD HH:mm:ss" UTC
  open:     string;
  high:     string;
  low:      string;
  close:    string;
}

interface TwelveDataResponse {
  meta?:   object;
  values?: TwelveDataBar[];
  code?:   number;
  message?: string;
  status?: string;
}

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class TwelvedataProvider implements MarketDataProvider {
  private readonly logger = new Logger(TwelvedataProvider.name);

  readonly providerId: MarketProviderId = 'twelvedata';

  private get apiKey(): string | undefined {
    return process.env.TWELVEDATA_API_KEY;
  }

  private get baseUrl(): string {
    return process.env.TWELVEDATA_BASE_URL ?? 'https://api.twelvedata.com';
  }

  // ── isConfigured ─────────────────────────────────────────────────────
  isConfigured(): boolean {
    return !!this.apiKey;
  }

  // ── supportsTimeframe ────────────────────────────────────────────────
  supportsTimeframe(tf: CanonicalTimeframe): boolean {
    return tf in INTERVAL_MAP;
  }

  // ── backfillCount ─────────────────────────────────────────────────────
  backfillCount(timeframe: CanonicalTimeframe): number {
    return BACKFILL_COUNT[timeframe] ?? 500;
  }

  // ── fetchLatestBar ───────────────────────────────────────────────────
  async fetchLatestBar(input: FetchLatestBarInput): Promise<CanonicalCandle | null> {
    const candles = await this.fetchRange({
      symbol:    input.symbol,
      timeframe: input.timeframe,
      from:      new Date(Date.now() - (TF_MS[input.timeframe] ?? TF_MS['H1']) * 3).toISOString(),
      to:        new Date().toISOString(),
      limit:     3,
    });
    const complete = candles.filter((c) => c.isComplete !== false);
    if (complete.length === 0) return null;
    return complete[complete.length - 1];
  }

  // ── fetchRange ───────────────────────────────────────────────────────
  async fetchRange(input: FetchRangeInput): Promise<CanonicalCandle[]> {
    if (!this.isConfigured()) {
      this.logger.warn('[Twelvedata] TWELVEDATA_API_KEY 未設定 → skip');
      return [];
    }

    const interval = INTERVAL_MAP[input.timeframe];
    if (!interval) {
      this.logger.warn(`[Twelvedata] 未対応 timeframe: ${input.timeframe}`);
      return [];
    }

    const symbol     = this.toSymbol(input.symbol);   // EURUSD → EUR/USD
    const outputsize = Math.min(input.limit ?? 5000, 5000);

    // Twelve Data は start_date / end_date を "YYYY-MM-DD HH:mm:ss" 形式で受け付ける
    const startDate = this.toTwelveDataDate(input.from);
    const endDate   = this.toTwelveDataDate(input.to);

    const url = `${this.baseUrl}/time_series` +
      `?symbol=${encodeURIComponent(symbol)}` +
      `&interval=${interval}` +
      `&start_date=${encodeURIComponent(startDate)}` +
      `&end_date=${encodeURIComponent(endDate)}` +
      `&outputsize=${outputsize}` +
      `&order=ASC` +
      `&apikey=${this.apiKey}`;

    this.logger.debug(`[Twelvedata] fetchRange: ${symbol} ${input.timeframe} ${startDate} → ${endDate}`);

    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Twelvedata API error ${res.status}: ${body}`);
    }

    const json = await res.json() as TwelveDataResponse;

    // エラーレスポンス判定
    if (json.status === 'error' || json.code) {
      this.logger.warn(`[Twelvedata] API エラー: ${json.message ?? JSON.stringify(json)}`);
      return [];
    }

    const values = json.values ?? [];
    if (values.length === 0) {
      this.logger.debug(`[Twelvedata] 0件: ${symbol} ${input.timeframe}`);
      return [];
    }

    this.logger.debug(`[Twelvedata] 取得本数: ${values.length}`);

    const now = Date.now();
    const tfMs = TF_MS[input.timeframe] ?? TF_MS['H1'];

    return values.map((bar) => {
      const timeMs    = new Date(bar.datetime.replace(' ', 'T') + 'Z').getTime();
      const isComplete = (timeMs + tfMs) < now;
      return {
        provider:   this.providerId,
        symbol:     input.symbol,
        timeframe:  input.timeframe as CanonicalTimeframe,
        time:       new Date(timeMs).toISOString(),
        open:       parseFloat(bar.open),
        high:       parseFloat(bar.high),
        low:        parseFloat(bar.low),
        close:      parseFloat(bar.close),
        volume:     null,
        isComplete,
      };
    });
  }

  // ── healthCheck ──────────────────────────────────────────────────────
  async healthCheck(): Promise<ProviderHealthStatus> {
    if (!this.isConfigured()) return 'unconfigured';
    try {
      const result = await this.fetchRange({
        symbol:    'EURUSD',
        timeframe: 'H4',
        from:      new Date(Date.now() - 7 * 24 * 3_600_000).toISOString(),
        to:        new Date().toISOString(),
        limit:     3,
      });
      return result.length > 0 ? 'healthy' : 'degraded';
    } catch {
      return 'error';
    }
  }

  // ── private helpers ──────────────────────────────────────────────────

  /** EURUSD → EUR/USD */
  private toSymbol(symbol: string): string {
    if (symbol.length === 6) {
      return `${symbol.slice(0, 3)}/${symbol.slice(3)}`;
    }
    return symbol;
  }

  /** ISO8601 → "YYYY-MM-DD HH:mm:ss" (Twelve Data 形式) */
  private toTwelveDataDate(iso: string): string {
    return iso.replace('T', ' ').replace(/\.\d{3}Z$/, '').replace('Z', '');
  }
}