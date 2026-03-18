/**
 * apps/api/src/modules/snapshots/snapshots.service.ts
 *
 * 役割: Snapshots API のビジネスロジック
 *   - POST /api/v1/snapshots/capture  → capture()
 *   - POST /api/v1/snapshots/evaluate → evaluate()
 *   - GET  /api/v1/snapshots/latest   → getLatest()
 *   - GET  /api/v1/snapshots/:id      → getById()
 *   - GET  /api/v1/snapshots          → getList()
 *
 * 参照仕様:
 *   SPEC_v51_part3 §7「Snapshots API」
 *   packages/types/src/index.ts SnapshotResponse
 *   SPEC_v51_part4 §5.4「snapshot-capture ワーカー」
 *
 * Phase 2 変更（Task2-2 対応）:
 *   - STUB_INDICATORS 依存を廃止
 *   - indicator_cache テーブルから最新 IndicatorCacheShape を取得して使用
 *   - indicator_cache が存在しない場合のみ FALLBACK_INDICATORS（ゼロ値）を使用
 *   - calculateScore() に渡す ScoreIndicators を実値から構成
 *   - DB 保存する SnapshotIndicators を実値から構成
 *
 * 設計原則:
 *   - indicator 計算ロジックをこの service に書いてはいけない
 *   - indicator_cache から「読む」のみ
 *   - provider を直接呼んではいけない
 *
 * 変更禁止:
 *   - public メソッドシグネチャ（capture / evaluate / getLatest / getById / getList）
 */

import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  GetSnapshotsQuery,
  GetSnapshotsLatestQuery,
  CaptureSnapshotDto,
  EvaluateSnapshotDto,
} from '@fxde/types';
import type { EntryState } from '@fxde/types';
import { calculateScore, evaluateEntryDecision } from '@fxde/shared';
import type { ScoreIndicators, MtfAlignment } from '@fxde/shared';
import { SettingsService } from '../settings/settings.service';
import type { IndicatorCacheShape } from '../market-data/indicator-engine.service';

// ── フォールバック値（indicator_cache が存在しない場合のみ使用）────────────
// STUB ではなく FALLBACK という命名に変更してコメントで意図を明示する
// このフォールバック値が使われた場合、スコアは低くなる（意図的）
const FALLBACK_INDICATORS: IndicatorCacheShape = {
  ma:   { ma50: 0, ma200: 0, slope: 0, crossStatus: 'NONE', value: 0, status: 'neutral' },
  rsi:  { value: 50, divergence: false, status: 'neutral' },
  macd: { macdLine: 0, signal: 0, histogram: 0, crossStatus: 'NONE', macd: 0, status: 'neutral' },
  bb:   { upper: 0, mid: 0, lower: 0, bandwidth: 0, middle: 0, position: 'unknown', status: 'neutral' },
  atr:  { value: 0, ratio: 1, status: 'normal' },
  bias: { direction: 'neutral', strength: 'weak', label: 'Bias: neutral weak', status: 'neutral' },
};

const FALLBACK_ENTRY_CONTEXT = {
  rr:            0,
  lotSize:       0,
  isEventWindow: false,
  isCooldown:    false,
  forceLock:     false,
};

// ── indicator_cache → ScoreIndicators 変換 ───────────────────────────────────
// ScoreIndicators（@fxde/shared）は calculateScore() の入力型
function toScoreIndicators(ind: IndicatorCacheShape): ScoreIndicators {
  return {
    ma:   { ma50: ind.ma.ma50, ma200: ind.ma.ma200, slope: ind.ma.slope },
    rsi:  { value: ind.rsi.value, divergence: ind.rsi.divergence },
    macd: { macdLine: ind.macd.macdLine, signal: ind.macd.signal, histogram: ind.macd.histogram },
    atr:  { value: ind.atr.value, ratio: ind.atr.ratio },
  };
}

// ── indicator_cache → SnapshotIndicators 変換 ─────────────────────────────────
// SnapshotIndicators（@fxde/types）は DB 保存 / API レスポンス用
function toSnapshotIndicators(ind: IndicatorCacheShape) {
  return {
    ma:   { ma50: ind.ma.ma50, ma200: ind.ma.ma200, slope: ind.ma.slope, crossStatus: ind.ma.crossStatus },
    rsi:  { value: ind.rsi.value, divergence: ind.rsi.divergence },
    macd: { macdLine: ind.macd.macdLine, signal: ind.macd.signal, histogram: ind.macd.histogram, crossStatus: ind.macd.crossStatus },
    bb:   { upper: ind.bb.upper, mid: ind.bb.mid, lower: ind.bb.lower, bandwidth: ind.bb.bandwidth },
    atr:  { value: ind.atr.value, ratio: ind.atr.ratio },
  };
}

// ── entryState → entryDecision ────────────────────────────────────────────────
function buildEntryDecision(entryState: EntryState) {
  switch (entryState) {
    case 'ENTRY_OK':
      return {
        status:         'ENTRY_OK' as EntryState,
        reasons:        ['スコア基準を満たしています'],
        recommendation: 'エントリー可能です',
      };
    case 'SCORE_LOW':
      return {
        status:         'SCORE_LOW' as EntryState,
        reasons:        ['スコアが基準を下回っています'],
        recommendation: '待機してください。スコアが基準に達したら通知します',
      };
    case 'RISK_NG':
      return {
        status:         'RISK_NG' as EntryState,
        reasons:        ['リスク管理基準を超えています'],
        recommendation: 'リスク設定を見直してください',
      };
    case 'LOCKED':
      return {
        status:         'LOCKED' as EntryState,
        reasons:        ['強制ロックが有効です'],
        recommendation: 'ロックが解除されるまで待機してください',
      };
    case 'COOLDOWN':
      return {
        status:         'COOLDOWN' as EntryState,
        reasons:        ['冷却期間中です'],
        recommendation: '冷却期間が終了するまで待機してください',
      };
    default:
      return null;
  }
}

@Injectable()
export class SnapshotsService {
  private readonly logger = new Logger(SnapshotsService.name);

  constructor(
    private readonly prisma:    PrismaService,
    private readonly settings:  SettingsService,
  ) {}

  // ── indicator_cache 読み込み（内部共通）──────────────────────────────────

  /**
   * indicator_cache から最新の IndicatorCacheShape を取得する。
   * 存在しない場合は FALLBACK_INDICATORS を返す。
   * indicator 計算はここで行わない（IndicatorEngineService の責務）。
   */
  private async loadIndicators(
    symbol:    string,
    timeframe: string,
  ): Promise<{ indicators: IndicatorCacheShape; isFallback: boolean }> {
    const cached = await this.prisma.indicatorCache.findFirst({
      where:   { symbol, timeframe: timeframe as never },
      orderBy: { calculatedAt: 'desc' },
    });

    if (!cached) {
      this.logger.warn(
        `[Snapshot] indicator_cache 未存在 ${symbol}/${timeframe} → FALLBACK 使用`,
      );
      return { indicators: FALLBACK_INDICATORS, isFallback: true };
    }

    return {
      indicators: cached.indicators as unknown as IndicatorCacheShape,
      isFallback: false,
    };
  }

  // ── ユーザー設定読み込み（内部共通）─────────────────────────────────────

  private async loadSettings(userId: string): Promise<{
    scoreThreshold:  number;
    forceLock:       boolean;
    featureSwitches: { patternBonus?: boolean };
  }> {
    let scoreThreshold = 75;
    let forceLock      = false;
    let featureSwitches: { patternBonus?: boolean } = { patternBonus: false };
    try {
      const s = await this.settings.getSettings(userId);
      scoreThreshold  = s.scoreThreshold;
      forceLock       = s.forceLock;
      featureSwitches = (s.featureSwitches as { patternBonus?: boolean }) ?? {};
    } catch {
      // SETTINGS_NOT_FOUND: デフォルト値で続行
    }
    return { scoreThreshold, forceLock, featureSwitches };
  }

  // ── POST /api/v1/snapshots/capture ────────────────────────────────────

  /**
   * スコア計算 + スナップショット保存。
   *
   * Phase 2 変更:
   *   - STUB_INDICATORS → indicator_cache からの実値に変更
   *   - indicator_cache 未存在時は FALLBACK_INDICATORS（ゼロ値）を使用
   *
   * 参照: SPEC_v51_part3 §7 / SPEC_v51_part4 §5.4
   */
  async capture(userId: string, dto: CaptureSnapshotDto) {
    const { symbol, timeframe, asOf } = dto;
    const capturedAt = asOf ? new Date(asOf) : new Date();

    const { scoreThreshold, forceLock, featureSwitches } =
      await this.loadSettings(userId);

    // indicator_cache から実値取得（なければ FALLBACK）
    const { indicators: ind, isFallback } =
      await this.loadIndicators(symbol, timeframe);

    const scoreIndicators = toScoreIndicators(ind);
    const snapshotInd     = toSnapshotIndicators(ind);

    const scoreResult = calculateScore({
      indicators:      scoreIndicators,
      patterns:        [],
      mtfAlignment:    {} as MtfAlignment,
      rr:              FALLBACK_ENTRY_CONTEXT.rr,
      featureSwitches,
    });

    const decision = evaluateEntryDecision({
      score:          scoreResult.total,
      rr:             FALLBACK_ENTRY_CONTEXT.rr,
      lotSize:        FALLBACK_ENTRY_CONTEXT.lotSize,
      maxLot:         0,
      isEventWindow:  false,
      isCooldown:     false,
      isDailyLimit:   false,
      forceLock,
      scoreThreshold,
    });

    if (isFallback) {
      this.logger.warn(
        `[Snapshot] capture ${symbol}/${timeframe}: indicator_cache 未存在のため FALLBACK スコア使用`,
      );
    }

    try {
      const snapshot = await this.prisma.snapshot.create({
        data: {
          userId,
          symbol,
          timeframe:      timeframe as any,
          capturedAt,
          indicators:     snapshotInd as any,
          patterns:       [],
          mtfAlignment:   {},
          scoreTotal:     scoreResult.total,
          scoreBreakdown: scoreResult.breakdown,
          entryState:     decision.status as any,
          entryContext:   FALLBACK_ENTRY_CONTEXT,
        },
      });

      return this.formatSnapshot(snapshot);
    } catch (error) {
      this.logger.error(
        `capture failed userId=${userId} symbol=${symbol}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  // ── POST /api/v1/snapshots/evaluate ──────────────────────────────────

  /**
   * 保存なしのスコア評価のみ。capture と同一 response shape を返す。
   *
   * Phase 2 変更:
   *   - STUB_INDICATORS → indicator_cache からの実値に変更
   *
   * 参照: SPEC_v51_part3 §7
   */
  async evaluate(userId: string, dto: EvaluateSnapshotDto) {
    const { symbol, timeframe, asOf } = dto;
    const capturedAt = asOf ? new Date(asOf) : new Date();

    const { scoreThreshold, forceLock, featureSwitches } =
      await this.loadSettings(userId);

    const { indicators: ind } = await this.loadIndicators(symbol, timeframe);
    const scoreIndicators = toScoreIndicators(ind);
    const snapshotInd     = toSnapshotIndicators(ind);

    const scoreResult = calculateScore({
      indicators:      scoreIndicators,
      patterns:        [],
      mtfAlignment:    {} as MtfAlignment,
      rr:              FALLBACK_ENTRY_CONTEXT.rr,
      featureSwitches,
    });

    const decision = evaluateEntryDecision({
      score:          scoreResult.total,
      rr:             FALLBACK_ENTRY_CONTEXT.rr,
      lotSize:        FALLBACK_ENTRY_CONTEXT.lotSize,
      maxLot:         0,
      isEventWindow:  false,
      isCooldown:     false,
      isDailyLimit:   false,
      forceLock,
      scoreThreshold,
    });

    return this.formatSnapshotRaw({
      id:             crypto.randomUUID(),
      userId,
      symbol,
      timeframe:      timeframe as string,
      capturedAt,
      indicators:     snapshotInd,
      patterns:       [],
      mtfAlignment:   {},
      scoreTotal:     scoreResult.total,
      scoreBreakdown: scoreResult.breakdown,
      entryState:     decision.status,
      entryContext:   FALLBACK_ENTRY_CONTEXT,
      createdAt:      capturedAt,
    });
  }

  // ── GET /api/v1/snapshots/latest ──────────────────────────────────────

  async getLatest(userId: string, query: GetSnapshotsLatestQuery) {
    const snapshot = await this.prisma.snapshot.findFirst({
      where: {
        userId,
        ...(query.symbol    && { symbol: query.symbol }),
        ...(query.timeframe && { timeframe: query.timeframe as any }),
      },
      orderBy: { capturedAt: 'desc' },
    });

    if (!snapshot) return null;
    return this.formatSnapshot(snapshot);
  }

  // ── GET /api/v1/snapshots/:id ─────────────────────────────────────────

  async getById(userId: string, id: string) {
    const snapshot = await this.prisma.snapshot.findUnique({
      where: { id },
    });

    if (!snapshot) throw new NotFoundException('Snapshot not found');
    if (snapshot.userId !== userId) throw new ForbiddenException();

    return this.formatSnapshot(snapshot);
  }

  // ── GET /api/v1/snapshots ─────────────────────────────────────────────

  async getList(userId: string, query: GetSnapshotsQuery) {
    const { symbol, timeframe, entryState, from, to, page, limit } = query;

    const [data, total] = await Promise.all([
      this.prisma.snapshot.findMany({
        where: {
          userId,
          ...(symbol     && { symbol }),
          ...(timeframe  && { timeframe: timeframe as any }),
          ...(entryState && { entryState: entryState as any }),
          ...(from       && { capturedAt: { gte: new Date(from) } }),
          ...(to         && { capturedAt: { lte: new Date(to) } }),
        },
        orderBy: { capturedAt: 'desc' },
        skip:    (page - 1) * limit,
        take:    limit,
      }),
      this.prisma.snapshot.count({
        where: {
          userId,
          ...(symbol     && { symbol }),
          ...(timeframe  && { timeframe: timeframe as any }),
          ...(entryState && { entryState: entryState as any }),
        },
      }),
    ]);

    return {
      data:  data.map((s) => this.formatSnapshot(s)),
      total,
      page,
      limit,
    };
  }

  // ── private helpers ───────────────────────────────────────────────────

  private formatSnapshot(snapshot: {
    id:             string;
    userId:         string;
    symbol:         string;
    timeframe:      string;
    capturedAt:     Date;
    indicators:     unknown;
    patterns:       unknown;
    mtfAlignment:   unknown;
    scoreTotal:     number;
    scoreBreakdown: unknown;
    entryState:     string;
    entryContext:   unknown;
    createdAt:      Date;
  }) {
    return this.formatSnapshotRaw({
      ...snapshot,
      capturedAt: snapshot.capturedAt,
      createdAt:  snapshot.createdAt,
    });
  }

  private formatSnapshotRaw(snapshot: {
    id:             string;
    userId:         string;
    symbol:         string;
    timeframe:      string;
    capturedAt:     Date;
    indicators:     unknown;
    patterns:       unknown;
    mtfAlignment:   unknown;
    scoreTotal:     number;
    scoreBreakdown: unknown;
    entryState:     string;
    entryContext:   unknown;
    createdAt:      Date;
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