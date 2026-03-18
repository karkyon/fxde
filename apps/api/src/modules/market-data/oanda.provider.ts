/**
 * apps/api/src/modules/market-data/oanda.provider.ts
 *
 * OANDA v20 REST API クライアント（副系 price provider）
 *
 * 参照仕様:
 *   SPEC_v51_part1 §8.1 oanda: FX価格OHLC（副）/ isRequired=false
 *   SPEC_v51_part1 §8.3 フォールバック戦略
 *   FXDE_OANDA_TO_PROVIDER_ADAPTER_DETAILED_DESIGN §6.2
 *
 * 役割:
 *   - OANDA Practice/Live API から candles を取得
 *   - FXDE Timeframe → OANDA granularity 変換
 *   - EURUSD → EUR_USD symbol 変換
 *   - 未設定時は unconfigured 扱い（503 を投げない・静かに skip）
 *
 * Phase 1 追加:
 *   - MarketDataProvider interface を implements
 *   - providerId / supportsTimeframe / fetchLatestBar / fetchRange / healthCheck を追加
 *   - fetchLatestBar / fetchRange は既存 fetchCandles を内部利用（重複ロジック禁止）
 *   - 既存メソッド（fetchCandles / toInstrument / isConfigured）は全て維持
 *
 * Phase 1.5 変更:
 *   - backfillCount のシグネチャを interface に合わせる（string → CanonicalTimeframe）
 *     CanonicalTimeframe = Timeframe なので実行時互換あり
 *   - toCanonical に isComplete: true を付与
 *     fetchCandles は .filter((c) => c.complete) 済みのため常に確定足
 */

import { Injectable, Logger } from '@nestjs/common';
import type { MarketProviderId, CanonicalCandle, CanonicalTimeframe } from '@fxde/types';
import type {
  MarketDataProvider,
  FetchLatestBarInput,
  FetchRangeInput,
  ProviderHealthStatus,
} from './market-data-provider.interface';

// ── FXDE Timeframe → OANDA granularity 変換テーブル ──────────────────────
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

// ── バックフィル本数（時間足別・OANDA特性に合わせた値）──────────────────
const BACKFILL_COUNT: Record<string, number> = {
  M1:  500,
  M5:  500, M15: 500, M30: 500,
  H1:  500, H4:  500, H8:  500,
  D1:  500, W1:  300, MN:  200,
};

// ── 既存 OandaCandle 型（内部利用・後方互換維持）──────────────────────────
export interface OandaCandle {
  time:   string;   // ISO 8601
  open:   number;
  high:   number;
  low:    number;
  close:  number;
  volume: number;
}

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class OandaProvider implements MarketDataProvider {
  private readonly logger = new Logger(OandaProvider.name);

  // ── MarketDataProvider.providerId ──────────────────────────────────────
  readonly providerId: MarketProviderId = 'oanda';

  // ── env getters ────────────────────────────────────────────────────────
  private get apiKey():    string | undefined { return process.env.OANDA_API_KEY; }
  private get accountId(): string | undefined { return process.env.OANDA_ACCOUNT_ID; }
  private get baseUrl():   string {
    // Practice デフォルト
    return process.env.OANDA_API_URL ?? 'https://api-fxpractice.oanda.com';
  }

  // ── 既存 public メソッド（維持）────────────────────────────────────────

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

  /**
   * candles 取得（最新 count 本）
   * 既存メソッド維持。fetchLatestBar / fetchRange の内部利用元。
   * .filter((c) => c.complete) 済み → 返却は全て確定足
   */
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
      .filter((c) => c.complete)          // 確定足のみ
      .map((c) => ({
        time:   c.time,
        open:   parseFloat(c.mid.o),
        high:   parseFloat(c.mid.h),
        low:    parseFloat(c.mid.l),
        close:  parseFloat(c.mid.c),
        volume: c.volume,
      }));
  }

  // ── MarketDataProvider interface 実装 ─────────────────────────────────

  /** MarketDataProvider: timeframe サポート確認 */
  supportsTimeframe(tf: CanonicalTimeframe): boolean {
    return tf in GRANULARITY_MAP;
  }

  /**
   * MarketDataProvider.backfillCount（Phase 1.5: interface 実装として整合）
   * シグネチャを string → CanonicalTimeframe に変更。CanonicalTimeframe = Timeframe なので互換あり。
   * OANDA の特性（count ベース API）に合わせた時間足別本数を返す
   */
  backfillCount(timeframe: CanonicalTimeframe): number {
    return BACKFILL_COUNT[timeframe] ?? 500;
  }

  /**
   * MarketDataProvider.fetchLatestBar
   * fetchCandles を内部利用（重複ロジック禁止）
   */
  async fetchLatestBar(input: FetchLatestBarInput): Promise<CanonicalCandle | null> {
    const candles = await this.fetchCandles(input.symbol, input.timeframe, 1);
    if (candles.length === 0) return null;
    // complete フィルタ済み配列の最後の1本が最新確定足
    const c = candles[candles.length - 1];
    return this.toCanonical(input.symbol, input.timeframe, c);
  }

  /**
   * MarketDataProvider.fetchRange
   * fetchCandles を内部利用（重複ロジック禁止）
   * OANDA は count ベース取得のため limit で count を指定し from/to でフィルタする
   */
  async fetchRange(input: FetchRangeInput): Promise<CanonicalCandle[]> {
    const count   = input.limit ?? 500;
    const candles = await this.fetchCandles(input.symbol, input.timeframe, count);

    const fromMs = new Date(input.from).getTime();
    const toMs   = new Date(input.to).getTime();

    return candles
      .filter((c) => {
        const t = new Date(c.time).getTime();
        return t >= fromMs && t <= toMs;
      })
      .map((c) => this.toCanonical(input.symbol, input.timeframe, c));
  }

  /**
   * MarketDataProvider.healthCheck
   * fetchCandles(1本) でアクセス確認する
   */
  async healthCheck(): Promise<ProviderHealthStatus> {
    if (!this.isConfigured()) return 'unconfigured';
    try {
      await this.fetchCandles('EURUSD', 'H1', 1);
      return 'healthy';
    } catch {
      return 'error';
    }
  }

  // ── private helper ────────────────────────────────────────────────────

  /**
   * OandaCandle → CanonicalCandle 変換
   * Phase 1.5: isComplete: true を付与
   * 根拠: fetchCandles が .filter((c) => c.complete) 済みのため常に確定足
   */
  private toCanonical(
    symbol:    string,
    timeframe: string,
    c:         OandaCandle,
  ): CanonicalCandle {
    return {
      provider:   this.providerId,
      symbol,
      timeframe:  timeframe as CanonicalTimeframe,
      time:       c.time,
      open:       c.open,
      high:       c.high,
      low:        c.low,
      close:      c.close,
      volume:     c.volume,
      isComplete: true,   // Phase 1.5 追加: OANDA は complete フィルタ済みなので常に true
    };
  }
}