/**
 * apps/api/src/modules/snapshots/snapshots.service.ts
 *
 * 役割: Snapshots API のビジネスロジック
 *
 * STEP 2 変更（2026-03-19）:
 *   - STUB_INDICATORS を完全排除
 *   - indicator_cache から実値を取得して calculateScore() に渡す
 *   - indicator_cache が存在しない場合のみ FALLBACK_INDICATORS（全ゼロ）使用
 *   - indicator 計算はこのサービスに書かない（IndicatorEngineService の責務）
 */

import {
  Injectable, Logger, NotFoundException, ForbiddenException,
} from '@nestjs/common';
import { PrismaService }  from '../../prisma/prisma.service';
import {
  GetSnapshotsQuery, GetSnapshotsLatestQuery,
  CaptureSnapshotDto, EvaluateSnapshotDto,
} from '@fxde/types';
import type { EntryState }                   from '@fxde/types';
import { calculateScore, evaluateEntryDecision } from '@fxde/shared';
import type { ScoreIndicators, MtfAlignment }    from '@fxde/shared';
import { SettingsService }                   from '../settings/settings.service';
import type { IndicatorCacheShape }          from '../market-data/indicator-engine.service';

// ── FALLBACK（indicator_cache 未存在時のみ）───────────────────────────────────
const FALLBACK_INDICATORS: IndicatorCacheShape = {
  ma:   { ma50: 0, ma200: 0, slope: 0, crossStatus: 'NONE', value: 0, status: 'neutral' },
  rsi:  { value: 50, divergence: false, status: 'neutral' },
  macd: { macdLine: 0, signal: 0, histogram: 0, crossStatus: 'NONE', macd: 0, status: 'neutral' },
  bb:   { upper: 0, mid: 0, lower: 0, bandwidth: 0, middle: 0, position: 'unknown', status: 'neutral' },
  atr:  { value: 0, ratio: 1, status: 'normal' },
  bias: { direction: 'neutral', strength: 'weak', label: 'Bias: neutral weak', status: 'neutral' },
};

const FALLBACK_ENTRY_CONTEXT = {
  rr: 0, lotSize: 0, isEventWindow: false, isCooldown: false, forceLock: false,
};

// ── 変換ヘルパー ──────────────────────────────────────────────────────────────

function toScoreIndicators(ind: IndicatorCacheShape): ScoreIndicators {
  return {
    ma:   { ma50: ind.ma.ma50, ma200: ind.ma.ma200, slope: ind.ma.slope },
    rsi:  { value: ind.rsi.value, divergence: ind.rsi.divergence },
    macd: { macdLine: ind.macd.macdLine, signal: ind.macd.signal, histogram: ind.macd.histogram },
    atr:  { value: ind.atr.value, ratio: ind.atr.ratio },
  };
}

function toSnapshotIndicators(ind: IndicatorCacheShape) {
  return {
    ma:   { ma50: ind.ma.ma50, ma200: ind.ma.ma200, slope: ind.ma.slope, crossStatus: ind.ma.crossStatus },
    rsi:  { value: ind.rsi.value, divergence: ind.rsi.divergence },
    macd: { macdLine: ind.macd.macdLine, signal: ind.macd.signal, histogram: ind.macd.histogram, crossStatus: ind.macd.crossStatus },
    bb:   { upper: ind.bb.upper, mid: ind.bb.mid, lower: ind.bb.lower, bandwidth: ind.bb.bandwidth },
    atr:  { value: ind.atr.value, ratio: ind.atr.ratio },
  };
}

function buildEntryDecision(entryState: EntryState) {
  switch (entryState) {
    case 'ENTRY_OK':  return { status: 'ENTRY_OK'  as EntryState, reasons: ['スコア基準を満たしています'],    recommendation: 'エントリー可能です' };
    case 'SCORE_LOW': return { status: 'SCORE_LOW' as EntryState, reasons: ['スコアが基準を下回っています'],  recommendation: '待機してください。スコアが基準に達したら通知します' };
    case 'RISK_NG':   return { status: 'RISK_NG'   as EntryState, reasons: ['リスク管理基準を超えています'],  recommendation: 'リスク設定を見直してください' };
    case 'LOCKED':    return { status: 'LOCKED'    as EntryState, reasons: ['強制ロックが有効です'],         recommendation: 'ロックが解除されるまで待機してください' };
    case 'COOLDOWN':  return { status: 'COOLDOWN'  as EntryState, reasons: ['冷却期間中です'],              recommendation: '冷却期間が終了するまで待機してください' };
    default:          return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class SnapshotsService {
  private readonly logger = new Logger(SnapshotsService.name);

  constructor(
    private readonly prisma:   PrismaService,
    private readonly settings: SettingsService,
  ) {}

  // ── 内部共通 ────────────────────────────────────────────────────────────

  private async loadIndicators(symbol: string, timeframe: string) {
    const cached = await this.prisma.indicatorCache.findFirst({
      where:   { symbol, timeframe: timeframe as never },
      orderBy: { calculatedAt: 'desc' },
    });
    if (!cached) {
      this.logger.warn(`[Snapshot] indicator_cache 未存在 ${symbol}/${timeframe} → FALLBACK`);
      return { ind: FALLBACK_INDICATORS, isFallback: true };
    }
    return { ind: cached.indicators as unknown as IndicatorCacheShape, isFallback: false };
  }

  private async loadUserSettings(userId: string) {
    let scoreThreshold = 75;
    let forceLock = false;
    let featureSwitches: { patternBonus?: boolean } = { patternBonus: false };
    try {
      const s = await this.settings.getSettings(userId);
      scoreThreshold  = s.scoreThreshold;
      forceLock       = s.forceLock;
      featureSwitches = (s.featureSwitches as { patternBonus?: boolean }) ?? {};
    } catch { /* SETTINGS_NOT_FOUND: デフォルト値で続行 */ }
    return { scoreThreshold, forceLock, featureSwitches };
  }

  // ── POST /api/v1/snapshots/capture ───────────────────────────────────────

  async capture(userId: string, dto: CaptureSnapshotDto) {
    const { symbol, timeframe, asOf } = dto;
    const capturedAt = asOf ? new Date(asOf) : new Date();

    const { scoreThreshold, forceLock, featureSwitches } = await this.loadUserSettings(userId);
    const { ind, isFallback } = await this.loadIndicators(symbol, timeframe);

    if (isFallback) {
      this.logger.warn(`[Snapshot.capture] ${symbol}/${timeframe}: FALLBACK スコア使用`);
    }

    const scoreResult = calculateScore({
      indicators:      toScoreIndicators(ind),
      patterns:        [],
      mtfAlignment:    {} as MtfAlignment,
      rr:              FALLBACK_ENTRY_CONTEXT.rr,
      featureSwitches,
    });

    const decision = evaluateEntryDecision({
      score: scoreResult.total, rr: FALLBACK_ENTRY_CONTEXT.rr,
      lotSize: FALLBACK_ENTRY_CONTEXT.lotSize, maxLot: 0,
      isEventWindow: false, isCooldown: false, isDailyLimit: false,
      forceLock, scoreThreshold,
    });

    try {
      const snapshot = await this.prisma.snapshot.create({
        data: {
          userId, symbol,
          timeframe:      timeframe as never,
          capturedAt,
          indicators:     toSnapshotIndicators(ind) as never,
          patterns:       [],
          mtfAlignment:   {},
          scoreTotal:     scoreResult.total,
          scoreBreakdown: scoreResult.breakdown,
          entryState:     decision.status as never,
          entryContext:   FALLBACK_ENTRY_CONTEXT,
        },
      });
      return this.formatSnapshot(snapshot);
    } catch (error) {
      this.logger.error(`capture 失敗 userId=${userId} ${symbol}`, error instanceof Error ? error.stack : String(error));
      throw error;
    }
  }

  // ── POST /api/v1/snapshots/evaluate ──────────────────────────────────────

  async evaluate(userId: string, dto: EvaluateSnapshotDto) {
    const { symbol, timeframe, asOf } = dto;
    const capturedAt = asOf ? new Date(asOf) : new Date();

    const { scoreThreshold, forceLock, featureSwitches } = await this.loadUserSettings(userId);
    const { ind } = await this.loadIndicators(symbol, timeframe);

    const scoreResult = calculateScore({
      indicators: toScoreIndicators(ind), patterns: [],
      mtfAlignment: {} as MtfAlignment, rr: FALLBACK_ENTRY_CONTEXT.rr, featureSwitches,
    });

    const decision = evaluateEntryDecision({
      score: scoreResult.total, rr: FALLBACK_ENTRY_CONTEXT.rr,
      lotSize: FALLBACK_ENTRY_CONTEXT.lotSize, maxLot: 0,
      isEventWindow: false, isCooldown: false, isDailyLimit: false,
      forceLock, scoreThreshold,
    });

    return this.formatSnapshotRaw({
      id: crypto.randomUUID(), userId, symbol,
      timeframe: timeframe as string, capturedAt,
      indicators: toSnapshotIndicators(ind), patterns: [], mtfAlignment: {},
      scoreTotal: scoreResult.total, scoreBreakdown: scoreResult.breakdown,
      entryState: decision.status, entryContext: FALLBACK_ENTRY_CONTEXT,
      createdAt: capturedAt,
    });
  }

  // ── GET /api/v1/snapshots/latest ─────────────────────────────────────────

  async getLatest(userId: string, query: GetSnapshotsLatestQuery) {
    const snapshot = await this.prisma.snapshot.findFirst({
      where: {
        userId,
        ...(query.symbol    && { symbol: query.symbol }),
        ...(query.timeframe && { timeframe: query.timeframe as never }),
      },
      orderBy: { capturedAt: 'desc' },
    });
    if (!snapshot) return null;
    return this.formatSnapshot(snapshot);
  }

  // ── GET /api/v1/snapshots/:id ─────────────────────────────────────────────

  async getById(userId: string, id: string) {
    const snapshot = await this.prisma.snapshot.findUnique({ where: { id } });
    if (!snapshot) throw new NotFoundException('Snapshot not found');
    if (snapshot.userId !== userId) throw new ForbiddenException();
    return this.formatSnapshot(snapshot);
  }

  // ── GET /api/v1/snapshots ─────────────────────────────────────────────────

  async getList(userId: string, query: GetSnapshotsQuery) {
    const { symbol, timeframe, entryState, from, to, page, limit } = query;
    const where = {
      userId,
      ...(symbol     && { symbol }),
      ...(timeframe  && { timeframe: timeframe as never }),
      ...(entryState && { entryState: entryState as never }),
      ...(from       && { capturedAt: { gte: new Date(from) } }),
      ...(to         && { capturedAt: { lte: new Date(to) } }),
    };
    const [data, total] = await Promise.all([
      this.prisma.snapshot.findMany({ where, orderBy: { capturedAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      this.prisma.snapshot.count({ where }),
    ]);
    return { data: data.map((s) => this.formatSnapshot(s)), total, page, limit };
  }

  // ── private helpers ───────────────────────────────────────────────────────

  private formatSnapshot(snapshot: {
    id: string; userId: string; symbol: string; timeframe: string;
    capturedAt: Date; indicators: unknown; patterns: unknown; mtfAlignment: unknown;
    scoreTotal: number; scoreBreakdown: unknown; entryState: string;
    entryContext: unknown; createdAt: Date;
  }) {
    return this.formatSnapshotRaw({ ...snapshot });
  }

  private formatSnapshotRaw(snapshot: {
    id: string; userId: string; symbol: string; timeframe: string;
    capturedAt: Date; indicators: unknown; patterns: unknown; mtfAlignment: unknown;
    scoreTotal: number; scoreBreakdown: unknown; entryState: string;
    entryContext: unknown; createdAt: Date;
  }) {
    const entryState = snapshot.entryState as EntryState;
    return {
      id:             snapshot.id,
      userId:         snapshot.userId,
      symbol:         snapshot.symbol,
      timeframe:      snapshot.timeframe,
      capturedAt:     snapshot.capturedAt.toISOString(),
      indicators:     snapshot.indicators,
      patterns:       snapshot.patterns,
      mtfAlignment:   snapshot.mtfAlignment,
      scoreTotal:     snapshot.scoreTotal,
      scoreBreakdown: snapshot.scoreBreakdown,
      entryState,
      entryDecision:  buildEntryDecision(entryState),
      entryContext:   snapshot.entryContext,
      createdAt:      snapshot.createdAt.toISOString(),
    };
  }
}