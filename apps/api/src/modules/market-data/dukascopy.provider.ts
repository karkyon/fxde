/**
 * apps/api/src/modules/market-data/dukascopy.provider.ts
 *
 * Dukascopy 研究主系 Provider
 *
 * 参照設計:
 *   FXDE_DUKASCOPY_SPEC_NOTES_20260318 §3「初期実装範囲（推奨）」
 *   FXDE_PROVIDER_COMPARISON_DESIGN §2.1「研究用 provider 役割」
 *   FXDE_OANDA_TO_PROVIDER_ADAPTER_DETAILED_DESIGN §6.1（MarketDataProvider contract）
 *
 * 役割:
 *   - Dukascopy 公開 candle API から OHLCV を取得する（研究主系 provider）
 *   - date-range native（from/to 基準）取得
 *     OANDA と異なり calcFrom() による count→range 変換は不要
 *   - provider 内で UTC 正規化・isComplete 判定を完結させる
 *   - incomplete bar は isComplete: false を付与して返す
 *     DB への保存スキップは MarketDataService 側の責務（変更不要）
 *
 * isComplete 判定ルール:
 *   bar.time(ms) + tfMs(timeframe) < Date.now()
 *   バー開始時刻 + 時間足 1 本分のミリ秒 が現在時刻より過去 = 確定足
 *
 * 環境変数:
 *   DUKASCOPY_BASE_URL  省略時: https://freeserv.dukascopy.com/2.0
 *   DUKASCOPY_ENABLED   'true' で有効化（未設定または 'true' 以外 = unconfigured）
 *
 * 禁止事項（維持）:
 *   - service 層・chart 層への Dukascopy 固有処理の漏洩
 *   - class-validator 使用
 *   - OandaProvider のロジックコピー
 */

import { Injectable, Logger } from '@nestjs/common';
import type { MarketProviderId, CanonicalCandle, CanonicalTimeframe } from '@fxde/types';
import type {
  MarketDataProvider,
  FetchLatestBarInput,
  FetchRangeInput,
  ProviderHealthStatus,
} from './market-data-provider.interface';

// ── Dukascopy granularity 変換テーブル ────────────────────────────────────
// Dukascopy free service の granularity は分単位（minutes per bar）
const PATH_MAP: Record<string, string> = {
  M1:  'api/lastOneMinuteCandles',
  M5:  'api/lastOneMinuteCandles',
  M15: 'api/lastOneMinuteCandles',
  M30: 'api/lastOneMinuteCandles',
  H1:  'api/hourly',
  H4:  'api/hourly',
  H8:  'api/hourly',
  D1:  'api/daily',
  W1:  'api/daily',
  MN:  'api/daily',
};

// ── 時間足 1 本あたりのミリ秒 ─────────────────────────────────────────────
// isComplete 判定に使用する
// SPEC_NOTES §2.2: bar.time + tfMs < now で確定足判定
const TF_MS: Record<string, number> = {
  M1:   60_000,
  M5:   300_000,
  M15:  900_000,
  M30:  1_800_000,
  H1:   3_600_000,
  H4:   14_400_000,
  H8:   28_800_000,
  D1:   86_400_000,
  W1:   604_800_000,
  MN:   2_592_000_000,
};

// ── バックフィル本数（Dukascopy 研究用途・OANDA より多い）────────────────
// MarketDataProvider interface backfillCount() の返却値
// 参照: interface JSDoc 「Dukascopy → D1: 1000 / W1: 500 / MN: 120」
const BACKFILL_COUNT: Record<string, number> = {
  M1:   500,
  M5:   500,
  M15:  500,
  M30:  500,
  H1:   500,
  H4:   1000,
  H8:   500,
  D1:   1000,
  W1:   500,
  MN:   120,
};

// ── Dukascopy API レスポンス raw 型 ──────────────────────────────────────
// 公開 candle エンドポイントは配列形式で返却する
// 各要素: [timestamp_ms, open, high, low, close, volume]
type DukascopyRawCandle = [number, number, number, number, number, number];

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class DukascopyProvider implements MarketDataProvider {
  private readonly logger = new Logger(DukascopyProvider.name);

  // ── MarketDataProvider.providerId ─────────────────────────────────────
  readonly providerId: MarketProviderId = 'dukascopy';

  // ── env getters ───────────────────────────────────────────────────────
  private get baseUrl(): string {
    return (
      process.env.DUKASCOPY_BASE_URL ??
      'https://freeserv.dukascopy.com/2.0'
    );
  }

  // ── MarketDataProvider: isConfigured ──────────────────────────────────
  /**
   * DUKASCOPY_ENABLED='true' が必須
   * 未設定時は unconfigured 扱いとし、service 層に例外を伝播しない
   */
  isConfigured(): boolean {
    return process.env.DUKASCOPY_ENABLED === 'true';
  }

  // ── MarketDataProvider: supportsTimeframe ─────────────────────────────
  supportsTimeframe(tf: CanonicalTimeframe): boolean {
    return tf in PATH_MAP;
  }

  // ── MarketDataProvider: backfillCount ─────────────────────────────────
  /**
   * 時間足別バックフィル本数
   * 研究主系のため OANDA より多めの値（D1: 1000, W1: 500 等）
   */
  backfillCount(timeframe: CanonicalTimeframe): number {
    return BACKFILL_COUNT[timeframe] ?? 500;
  }

  // ── MarketDataProvider: fetchLatestBar ────────────────────────────────
  /**
   * 最新確定足 1 本を返す
   * fetchRange を内部利用（重複ロジック禁止）
   * now を to とし、3 本分の from を設定して取得後、確定足の末尾を返す
   */
  async fetchLatestBar(input: FetchLatestBarInput): Promise<CanonicalCandle | null> {
    const tfMs = TF_MS[input.timeframe] ?? TF_MS['H1'];
    const now  = new Date().toISOString();
    // 最新確定足を確実に含むよう 3 本分の余裕
    const from = new Date(Date.now() - tfMs * 3).toISOString();

    const candles = await this.fetchRange({
      symbol:    input.symbol,
      timeframe: input.timeframe,
      from,
      to:    now,
      limit: 3,
    });

    // 確定足のみ抽出し、最新（末尾）を返す
    const complete = candles.filter((c) => c.isComplete !== false);
    if (complete.length === 0) return null;
    return complete[complete.length - 1];
  }

  // ── MarketDataProvider: fetchRange ────────────────────────────────────
  /**
   * 指定 date-range のローソク足を取得する
   *
   * Dukascopy は from/to ネイティブ対応。
   * MarketDataService の calcFrom() が生成した from/to をそのまま使用できる。
   * （calcFrom() は OANDA 用近似計算だが、渡された from/to の解釈は provider 非依存）
   *
   * SPEC_NOTES §2.5: Dukascopy は「from/to 正本」
   */
  async fetchRange(input: FetchRangeInput): Promise<CanonicalCandle[]> {
    if (!this.isConfigured()) {
      this.logger.warn(
        'DUKASCOPY_ENABLED 未設定 → skip。' +
        'DUKASCOPY_ENABLED=true を .env に追加してください。',
      );
      return [];
    }

    const path = PATH_MAP[input.timeframe];
    if (!path) {
      this.logger.warn(`[Dukascopy] 未対応 timeframe: ${input.timeframe}`);
      return [];
    }

    const instrument = input.symbol.toUpperCase(); // EURUSD のまま使用
    const count      = input.limit ?? 500;

    const url =
      `${this.baseUrl}/?path=${path}` +
      `&instrument=${instrument}` +
      `&offer_side=B` +
      `&count=${count}`;

    const res = await fetch(url, {
      headers: {
        'Accept':          'application/json, text/plain, */*',
        'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer':         'https://www.dukascopy.com/',
        'Origin':          'https://www.dukascopy.com',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Dukascopy API error ${res.status}: ${body}`);
    }

    // 空レスポンス防御
    const text = await res.text();
    if (!text || text.length === 0) {
      this.logger.warn(`[Dukascopy] 空レスポンス: ${url}`);
      return [];
    }

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      this.logger.warn(`[Dukascopy] JSON parse失敗: ${text.slice(0, 100)}`);
      return [];
    }

    if (!Array.isArray(json)) {
      this.logger.warn(
        `[Dukascopy] 予期しないレスポンス形式: ${typeof json}`,
      );
      return [];
    }

    // isComplete 判定の基準時刻は fetch 開始時点で固定（ループ内でズレない）
    const now = Date.now();

    return json
      .filter((raw): raw is DukascopyRawCandle =>
        Array.isArray(raw) && raw.length >= 6,
      )
      .map((raw) => this.toCanonical(input.symbol, input.timeframe, raw, now));
  }

  // ── MarketDataProvider: healthCheck ───────────────────────────────────
  /**
   * 直近 1 週間の EURUSD H1 データ取得を試みて死活確認する
   */
  async healthCheck(): Promise<ProviderHealthStatus> {
    if (!this.isConfigured()) return 'unconfigured';
    try {
      const result = await this.fetchRange({
        symbol:    'EURUSD',
        timeframe: 'H1',
        from:      new Date(Date.now() - 7 * 24 * 3_600_000).toISOString(),
        to:        new Date().toISOString(),
        limit:     1,
      });
      return result.length > 0 ? 'healthy' : 'degraded';
    } catch (err) {
      this.logger.error(`[Dukascopy] healthCheck 失敗: ${String(err)}`);
      return 'error';
    }
  }

  // ── private helpers ───────────────────────────────────────────────────

  /**
   * FXDE symbol → Dukascopy instrument 形式
   * EURUSD → EUR/USD
   */
  private toInstrument(symbol: string): string {
    if (symbol.length === 6) {
      return `${symbol.slice(0, 3)}/${symbol.slice(3)}`;
    }
    return symbol;
  }

  /**
   * Dukascopy raw candle → CanonicalCandle 変換
   *
   * isComplete 判定（SPEC_NOTES §2.2 準拠）:
   *   timestampMs + tfMs(timeframe) < now
   *   バー開始時刻 + 1 本分のミリ秒 が現在時刻より過去 = 確定足
   *
   * volume（SPEC_NOTES §2.3 準拠）:
   *   Dukascopy の volume はティック数近似。
   *   0 は 0 のまま保持する（研究データとして統計的意味を持つ場合がある）。
   *
   * sourceTimeRaw:
   *   生 timestamp_ms を文字列で保持（デバッグ・正規化検証用）
   */
  private toCanonical(
    symbol:    string,
    timeframe: CanonicalTimeframe,
    raw:       DukascopyRawCandle,
    now:       number,
  ): CanonicalCandle {
    const [timestampMs, open, high, low, close, volume] = raw;

    // provider 内で UTC ISO8601 に正規化（SPEC_NOTES §2.1）
    const timeStr = new Date(timestampMs).toISOString();

    // isComplete: バー終了時刻 < 現在時刻
    const tfMs       = TF_MS[timeframe] ?? TF_MS['H1'];
    const isComplete = (timestampMs + tfMs) < now;

    return {
      provider:      this.providerId,
      symbol,
      timeframe,
      time:          timeStr,
      open,
      high,
      low,
      close,
      volume,
      isComplete,
      sourceTimeRaw: String(timestampMs),
    };
  }
}