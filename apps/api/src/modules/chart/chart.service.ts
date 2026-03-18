/**
 * apps/api/src/chart/chart.service.ts
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
 *   - meta / indicators / prediction-overlay: スタブ固定値を返す
 *   - candles: market_candles テーブルを参照（空の場合は空配列）
 *   - trades: trades テーブルの OPEN レコードを参照
 *   - pattern-markers: pattern_detections テーブルを参照 + ロール別 RBAC
 *   - Redis キャッシュは v5.1 ではスキップ（cachedAt: null で返却）
 */

import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MarketDataService } from '../market-data/market-data.service';
import type {
  ChartMetaQuery,
  ChartCandlesQuery,
  ChartIndicatorsQuery,
  ChartTradesQuery,
  ChartPatternMarkersQuery,
  ChartPredictionOverlayQuery,
} from '@fxde/types';
import type { UserRole } from '@fxde/types';

// ── スタブ定数（SPEC_v51_part8 §9.3 STUB_PREDICTION_RESULT 準拠） ──────────
const STUB_META = {
  currentPrice:  1.0842,
  spread:        0.3,
  marketStatus:  'open'  as const,
  sessionLabel:  'London Open',
  trendBias:     'bullish' as const,
};

const STUB_INDICATORS = {
  ma: {
    value:       1.0820,
    crossStatus: 'bullish' as const,
    slope:       0.0003,
    status:      'bullish' as const,
  },
  rsi: {
    value:      58.3,
    divergence: false,
    status:     'neutral' as const,
  },
  macd: {
    macd:        0.0012,
    signal:      0.0008,
    histogram:   0.0004,
    crossStatus: 'bullish' as const,
    status:      'bullish' as const,
  },
  atr: {
    value:  12.4,
    ratio:  1.0,
    status: 'normal' as 'normal' | 'high' | 'low',
  },
  bb: {
    upper:    1.0912,
    middle:   1.0842,
    lower:    1.0772,
    position: 'upper-middle' as const,
    status:   'neutral' as const,
  },
  bias: {
    direction: 'buy'      as const,
    strength:  'moderate' as const,
    label:     'Bias: buy moderate',
    status:    'bullish'  as const,
  },
};

// SPEC_v51_part11 §3.6 STUB_PREDICTION_RESULT → mapStubToOverlay 変換
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

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class ChartService {
  constructor(
    private readonly prisma:      PrismaService,
    private readonly marketData:  MarketDataService,
  ) {}

  // ── GET /api/v1/chart/meta ──────────────────────────────────────────────
  // SPEC_v51_part11 §3.1
  async getMeta(query: ChartMetaQuery) {
    const now = new Date().toISOString();
    return {
      symbol:       query.symbol,
      timeframe:    query.timeframe,
      ...STUB_META,
      cachedAt:     null,
      updatedAt:    now,
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
      candles:   candles.map((c) => ({
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
  // v5.1: indicator_cache の最新レコードを参照。存在しなければスタブ固定値。
  async getIndicators(query: ChartIndicatorsQuery) {
    const now = new Date().toISOString();
    const cached = await this.prisma.indicatorCache.findFirst({
      where:   { symbol: query.symbol, timeframe: query.timeframe as never },
      orderBy: { calculatedAt: 'desc' },
    });

    const indicators = cached
      ? (cached.indicators as typeof STUB_INDICATORS)
      : STUB_INDICATORS;

    return {
      symbol:     query.symbol,
      timeframe:  query.timeframe,
      indicators,
      cachedAt:   cached ? cached.calculatedAt.toISOString() : null,
      updatedAt:  now,
    };
  }

  // ── GET /api/v1/chart/trades ────────────────────────────────────────────
  // SPEC_v51_part11 §3.4
  // trades テーブルの status=OPEN かつ symbol 一致の最新レコードを返す
  async getTrades(userId: string, query: ChartTradesQuery) {
    const trade = await this.prisma.trade.findFirst({
      where: {
        userId,
        symbol: query.symbol,
        status: 'OPEN',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!trade) {
      return { symbol: query.symbol, activeTrade: null };
    }

    const entry = Number(trade.entryPrice);
    const sl    = trade.sl    != null ? Number(trade.sl)    : null;
    const tp    = trade.tp    != null ? Number(trade.tp)    : null;
    const lot   = Number(trade.size);

    // RR 計算
    let rrRatio: number | null = null;
    if (sl != null && tp != null && Math.abs(entry - sl) > 0) {
      rrRatio = Math.abs(tp - entry) / Math.abs(entry - sl);
    }

    // 期待損益（円換算スタブ: 1pip ≈ ¥100 × lot として近似）
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
  // ロール別 RBAC: FREE → CANDLESTICK のみ / BASIC 以上 → 全 12 種
  // フロント側フィルタ禁止（SPEC_v51_part1 §0-16 準拠）
  async getPatternMarkers(
    userId: string,
    userRole: UserRole,
    query: ChartPatternMarkersQuery,
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
  // 権限チェック: RolesGuard で FREE | BASIC に 403（controller で実施）
  // v5.1: STUB_PREDICTION_RESULT 固定値を返す
  async getPredictionOverlay(query: ChartPredictionOverlayQuery) {
    return {
      symbol:    query.symbol,
      timeframe: query.timeframe,
      ...STUB_PREDICTION_OVERLAY,
      generatedAt: new Date().toISOString(),
    };
  }
}