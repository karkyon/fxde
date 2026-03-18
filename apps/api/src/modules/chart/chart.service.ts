/**
 * apps/api/src/modules/chart/chart.service.ts
 *
 * Chart API ビジネスロジック
 *
 * 参照仕様:
 *   SPEC_v51_part11 §3「API エンドポイント詳細」
 *   SPEC_v51_part11 §9.1「v5.1 実装許可項目」
 *   SPEC_v51_part11 §10.3「パターン検出 RBAC の実装位置」
 *   SPEC_v51_part10 §10.6〜§10.10「各セクション仕様」
 *   SPEC_v51_part8 §9.3「STUB_PREDICTION_RESULT」
 *
 * v5.1 実装方針:
 *   - meta: 最新 candle から currentPrice 取得、UTC 時刻からセッション計算
 *   - indicators: indicator_cache を参照。存在しない場合は null を返す（stub禁止）
 *   - candles: market_candles テーブルを参照（空の場合は空配列）
 *   - trades: trades テーブルの OPEN レコードを参照
 *   - pattern-markers: pattern_detections テーブルを参照 + ロール別 RBAC
 *   - prediction-overlay: v5.1 stub のまま（許容範囲）
 *   - Redis キャッシュは v5.1 ではスキップ（cachedAt: null で返却）
 *
 * STEP 1+2 変更（2026-03-19）:
 *   - STUB_META 定数を削除、getMeta() を動的値のみで構成
 *   - STUB_INDICATORS 定数を削除、getIndicators() は cache なし時 null 返却
 *   - IndicatorCacheShape import 追加
 *   - CanonicalCandle import 追加（map の implicit any 解消）
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService }      from '../../prisma/prisma.service';
import { MarketDataService }  from '../market-data/market-data.service';
import type { IndicatorCacheShape } from '../market-data/indicator-engine.service';
import type {
  ChartMetaQuery,
  ChartCandlesQuery,
  ChartIndicatorsQuery,
  ChartTradesQuery,
  ChartPatternMarkersQuery,
  ChartPredictionOverlayQuery,
  CanonicalCandle,
  UserRole,
} from '@fxde/types';

// ── prediction-overlay スタブ定数（v5.1 許容：SPEC_v51_part8 §9.3）────────
// STUB_META / STUB_INDICATORS は削除済み
const STUB_PREDICTION_OVERLAY = {
  mainScenario:     'Bullish Continuation',
  altScenario:      'Range Consolidation',
  probabilities: {
    bullish:  0.63,
    neutral:  0.22,
    bearish:  0.15,
  },
  expectedMovePips: 45,
  forecastHorizonH: 24,
  confidence:       'medium' as const,
  stub:             true     as const,
};

// ── セッション判定（UTC 時刻ベース）─────────────────────────────────────────
function getSessionLabel(utcHour: number): string {
  if (utcHour >= 0  && utcHour < 7)  return 'Asia Session';
  if (utcHour >= 7  && utcHour < 13) return 'London Open';
  if (utcHour >= 13 && utcHour < 17) return 'London/NY Overlap';
  if (utcHour >= 17 && utcHour < 21) return 'New York Session';
  return 'Off Hours';
}

// ── 市場ステータス判定（FX は月〜金 UTC が基準）────────────────────────────
function getMarketStatus(utcDay: number): 'open' | 'closed' {
  return (utcDay === 0 || utcDay === 6) ? 'closed' : 'open';
}

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class ChartService {
  private readonly logger = new Logger(ChartService.name);

  constructor(
    private readonly prisma:     PrismaService,
    private readonly marketData: MarketDataService,
  ) {}

  // ── GET /api/v1/chart/meta ──────────────────────────────────────────────
  // SPEC_v51_part11 §3.1
  //
  // STEP 1: STUB_META 完全排除
  //   currentPrice  → 最新 candle の close（取得できなければ null）
  //   sessionLabel  → UTC 時刻から計算
  //   marketStatus  → UTC 曜日から計算
  //   trendBias     → indicator_cache の bias.status（なければ 'neutral'）
  //   spread        → v5.1 は静的 0.3（実 spread 取得は v6 以降）
  async getMeta(query: ChartMetaQuery) {
    const now    = new Date();
    const utcH   = now.getUTCHours();
    const utcDay = now.getUTCDay();

    // currentPrice: 最新確定足の close を使用
    const candles = await this.marketData.getCandles(
      query.symbol,
      query.timeframe,
      1,
    );
    const currentPrice: number | null =
      candles.length > 0
        ? (candles[candles.length - 1] as CanonicalCandle).close
        : null;

    // trendBias: indicator_cache の bias.status を使用
    const cached = await this.prisma.indicatorCache.findFirst({
      where:   { symbol: query.symbol, timeframe: query.timeframe as never },
      orderBy: { calculatedAt: 'desc' },
    });
    const ind       = cached
      ? (cached.indicators as unknown as IndicatorCacheShape)
      : null;
    const trendBias = ind?.bias?.status ?? 'neutral';

    return {
      symbol:       query.symbol,
      timeframe:    query.timeframe,
      currentPrice,
      spread:       0.3,
      marketStatus: getMarketStatus(utcDay),
      sessionLabel: getSessionLabel(utcH),
      trendBias,
      cachedAt:     cached ? cached.calculatedAt.toISOString() : null,
      updatedAt:    now.toISOString(),
    };
  }

  // ── GET /api/v1/chart/candles ───────────────────────────────────────────
  // SPEC_v51_part11 §3.2
  async getCandles(query: ChartCandlesQuery) {
    const candles = await this.marketData.getCandles(
      query.symbol,
      query.timeframe,
      query.limit,
    );

    return {
      symbol:    query.symbol,
      timeframe: query.timeframe,
      candles:   (candles as CanonicalCandle[]).map((c) => ({
        time:   c.time,
        open:   c.open,
        high:   c.high,
        low:    c.low,
        close:  c.close,
        volume: c.volume ?? 0,
      })),
      cachedAt: null,
    };
  }

  // ── GET /api/v1/chart/indicators ────────────────────────────────────────
  // SPEC_v51_part11 §3.3
  //
  // STEP 2: STUB_INDICATORS 完全排除
  //   cache あり → cache データを返す
  //   cache なし → indicators: null（stub 禁止）
  //   フロント側: null 判定して「データ準備中」表示を行うこと
  async getIndicators(query: ChartIndicatorsQuery) {
    const now    = new Date().toISOString();
    const cached = await this.prisma.indicatorCache.findFirst({
      where:   { symbol: query.symbol, timeframe: query.timeframe as never },
      orderBy: { calculatedAt: 'desc' },
    });

    if (!cached) {
      this.logger.warn(
        `[Chart] indicator_cache 未存在 ${query.symbol}/${query.timeframe}`,
      );
      return {
        symbol:     query.symbol,
        timeframe:  query.timeframe,
        indicators: null,
        cachedAt:   null,
        updatedAt:  now,
      };
    }

    return {
      symbol:     query.symbol,
      timeframe:  query.timeframe,
      indicators: cached.indicators as unknown as IndicatorCacheShape,
      cachedAt:   cached.calculatedAt.toISOString(),
      updatedAt:  now,
    };
  }

  // ── GET /api/v1/chart/trades ────────────────────────────────────────────
  // SPEC_v51_part11 §3.4
  async getTrades(userId: string, query: ChartTradesQuery) {
    const trade = await this.prisma.trade.findFirst({
      where:   { userId, symbol: query.symbol, status: 'OPEN' },
      orderBy: { createdAt: 'desc' },
    });

    if (!trade) {
      return { symbol: query.symbol, activeTrade: null };
    }

    const entry = Number(trade.entryPrice);
    const sl    = trade.sl != null ? Number(trade.sl) : null;
    const tp    = trade.tp != null ? Number(trade.tp) : null;
    const lot   = Number(trade.size);

    let rrRatio: number | null = null;
    if (sl != null && tp != null && Math.abs(entry - sl) > 0) {
      rrRatio = Math.abs(tp - entry) / Math.abs(entry - sl);
    }

    const pipValue     = 100 * lot;
    const expectedLoss = sl != null ? -Math.abs(entry - sl) * 10000 * pipValue : null;
    const expectedGain = tp != null ?  Math.abs(tp - entry) * 10000 * pipValue : null;

    return {
      symbol: query.symbol,
      activeTrade: {
        tradeId:      trade.id,
        side:         trade.side,
        entryPrice:   entry,
        stopLoss:     sl,
        takeProfit:   tp,
        rrRatio:      rrRatio != null ? Math.round(rrRatio * 10) / 10 : null,
        lotSize:      lot,
        expectedLoss: expectedLoss != null ? Math.round(expectedLoss) : null,
        expectedGain: expectedGain != null ? Math.round(expectedGain) : null,
        entryTime:    (trade.entryTime ?? trade.createdAt).toISOString(),
      },
    };
  }

  // ── GET /api/v1/chart/pattern-markers ──────────────────────────────────
  // SPEC_v51_part11 §3.5 / §10.3
  async getPatternMarkers(
    userId:   string,
    userRole: UserRole,
    query:    ChartPatternMarkersQuery,
  ) {
    const allowedCategories: string[] =
      userRole === 'FREE'
        ? ['CANDLESTICK']
        : ['CANDLESTICK', 'FORMATION'];

    const detections = await this.prisma.patternDetection.findMany({
      where: {
        userId,
        symbol:          query.symbol,
        timeframe:       query.timeframe as never,
        patternCategory: { in: allowedCategories },
      },
      orderBy: { detectedAt: 'desc' },
      take:    query.limit,
    });

    return {
      symbol:    query.symbol,
      timeframe: query.timeframe,
      markers:   detections.map((d) => ({
        id:              d.id,
        patternName:     d.patternName,
        patternCategory: d.patternCategory,
        direction:       d.direction,
        confidence:      Number(d.confidence),
        detectedAt:      d.detectedAt.toISOString(),
        barIndex:        d.barIndex,
        price:           Number(d.price),
        label:           d.label,
      })),
    };
  }

  // ── GET /api/v1/chart/prediction-overlay ───────────────────────────────
  // SPEC_v51_part11 §3.6
  // v5.1: STUB_PREDICTION_RESULT 固定値（v5.1 許容範囲）
  async getPredictionOverlay(query: ChartPredictionOverlayQuery) {
    return {
      symbol:    query.symbol,
      timeframe: query.timeframe,
      ...STUB_PREDICTION_OVERLAY,
      generatedAt: new Date().toISOString(),
    };
  }
}