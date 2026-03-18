/**
 * apps/api/src/modules/snapshots/snapshots.service.ts
 *
 * 役割: Snapshots API のビジネスロジック
 *
 * Task1〜3 変更（2026-03-19）:
 *   - FALLBACK_ENTRY_CONTEXT を廃止
 *   - entryContext の各項目を実データから構成:
 *
 *     rr:             OPEN trade の sl/tp から計算（trade なし or sl/tp なし = 0）
 *     lotSize:        OPEN trade の size（trade なし = 0）
 *     maxLot:         0 固定のまま（口座残高情報が DB 上に存在しないため v5.1 では計算不能）
 *     isEventWindow:  EconomicEvent テーブルから symbol 通貨の HIGH/CRITICAL イベントを
 *                     現在時刻 ±30分 で判定
 *     isCooldown:     最後の CLOSED trade の exitTime + settings.cooldownMin > now で判定
 *     isDailyLimit:   本日の trade 数（OPEN + CLOSED）>= settings.maxTrades で判定
 *
 *   - patterns: PatternDetection テーブルから直近 5 件を取得して ScorePattern[] に変換
 *
 * v5.1 範囲の確認:
 *   - maxLot: 口座残高なし → 0 固定（v6 で実装）
 *   - isCooldown: cooldownMin 経過後の再エントリー制御（settings 依存）
 *   - isDailyLimit: 1日あたりのトレード上限（settings.maxTrades 依存）
 *   - isEventWindow: EconomicEvent テーブルのデータが入っている前提
 *
 * 変更禁止:
 *   - public メソッドシグネチャ（capture / evaluate / getLatest / getById / getList）
 *   - indicator 計算をここに書く
 *   - v6 機能（DTW / HMM / WFV）に触れる
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
import type { ScoreIndicators, MtfAlignment, ScorePattern } from '@fxde/shared';
import { SettingsService }                   from '../settings/settings.service';
import type { IndicatorCacheShape }          from '../market-data/indicator-engine.service';

// ── FALLBACK_INDICATORS（indicator_cache 未存在時のみ）────────────────────────
const FALLBACK_INDICATORS: IndicatorCacheShape = {
  ma:   { ma50: 0, ma200: 0, slope: 0, crossStatus: 'NONE', value: 0, status: 'neutral' },
  rsi:  { value: 50, divergence: false, status: 'neutral' },
  macd: { macdLine: 0, signal: 0, histogram: 0, crossStatus: 'NONE', macd: 0, status: 'neutral' },
  bb:   { upper: 0, mid: 0, lower: 0, bandwidth: 0, middle: 0, position: 'unknown', status: 'neutral' },
  atr:  { value: 0, ratio: 1, status: 'normal' },
  bias: { direction: 'neutral', strength: 'weak', label: 'Bias: neutral weak', status: 'neutral' },
};

// ── EventWindow 判定用の時間幅（分）─────────────────────────────────────────
// 指標発表前後 30 分を安全圏外とする（仕様 §7）
const EVENT_WINDOW_MINUTES = 30;

// ── 日次トレード上限デフォルト（settings 未設定時）──────────────────────────
const DEFAULT_MAX_TRADES   = 5;
const DEFAULT_COOLDOWN_MIN = 60;

// ── pattern_detections → ScorePattern 変換用定数 ────────────────────────────
// SPEC_v51_part6 §1.0 正式名称から bonus 値のデフォルトマッピング
const PATTERN_BONUS_MAP: Record<string, number> = {
  HeadAndShoulders:        12,
  InverseHeadAndShoulders: 12,
  DoubleTop:               10,
  DoubleBottom:            10,
  Triangle:                 8,
  Channel:                  8,
  // candlestick
  PinBar:                   6,
  Engulfing:                7,
  Doji:                     5,
  MorningStar:              9,
  ShootingStar:             8,
  ThreeSoldiers:           10,
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

// ── symbol から通貨ペア文字列を抽出（例: EURUSD → ['EUR', 'USD']）──────────────
function extractCurrencies(symbol: string): string[] {
  const s = symbol.toUpperCase();
  if (s.length === 6) return [s.slice(0, 3), s.slice(3)];
  // XAUUSD 等の 6 文字以外も念のため対応
  return [s];
}

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class SnapshotsService {
  private readonly logger = new Logger(SnapshotsService.name);

  constructor(
    private readonly prisma:   PrismaService,
    private readonly settings: SettingsService,
  ) {}

  // ── 内部: indicator_cache 読み込み ──────────────────────────────────────

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

  // ── 内部: ユーザー設定読み込み ──────────────────────────────────────────

  private async loadUserSettings(userId: string) {
    let scoreThreshold  = 75;
    let forceLock       = false;
    let featureSwitches: { patternBonus?: boolean } = { patternBonus: false };
    let cooldownMin     = DEFAULT_COOLDOWN_MIN;
    let maxTrades       = DEFAULT_MAX_TRADES;
    try {
      const s = await this.settings.getSettings(userId);
      scoreThreshold  = s.scoreThreshold;
      forceLock       = s.forceLock;
      featureSwitches = (s.featureSwitches as { patternBonus?: boolean }) ?? {};
      const rp = s.riskProfile as {
        cooldownMin?: number;
        maxTrades?:   number;
      } | null;
      if (rp) {
        cooldownMin = rp.cooldownMin ?? DEFAULT_COOLDOWN_MIN;
        maxTrades   = rp.maxTrades   ?? DEFAULT_MAX_TRADES;
      }
    } catch { /* SETTINGS_NOT_FOUND: デフォルト値で続行 */ }
    return { scoreThreshold, forceLock, featureSwitches, cooldownMin, maxTrades };
  }

  // ── 内部: entryContext を実データから構成 ────────────────────────────────

  /**
   * entryContext の各項目を DB から取得して構成する。
   *
   * Task1〜3 実データ化内容:
   *   rr / lotSize    → OPEN trade の sl/tp/size から計算
   *   isEventWindow   → EconomicEvent テーブルの ±30 分 HIGH/CRITICAL 判定
   *   isCooldown      → 最後の CLOSED trade の exitTime + cooldownMin > now
   *   isDailyLimit    → 本日の trade 数 >= maxTrades
   *
   * 残る v5.1 限界:
   *   maxLot = 0 固定: 口座残高が DB に存在しないため正確な maxLot は計算不能
   */
  private async buildEntryContext(
    userId:     string,
    symbol:     string,
    cooldownMin: number,
    maxTrades:  number,
    forceLock:  boolean,
  ) {
    const now = new Date();

    // ── rr / lotSize: OPEN trade の sl/tp/size から計算 ──────────────────
    let rr      = 0;
    let lotSize = 0;
    const openTrade = await this.prisma.trade.findFirst({
      where:   { userId, symbol, status: 'OPEN' },
      orderBy: { entryTime: 'desc' },
      select:  { entryPrice: true, sl: true, tp: true, size: true },
    });
    if (openTrade) {
      lotSize = Number(openTrade.size);
      const entry = Number(openTrade.entryPrice);
      const sl    = openTrade.sl != null ? Number(openTrade.sl) : null;
      const tp    = openTrade.tp != null ? Number(openTrade.tp) : null;
      if (sl != null && tp != null && Math.abs(entry - sl) > 0) {
        rr = Math.abs(tp - entry) / Math.abs(entry - sl);
        rr = Math.round(rr * 100) / 100;
      }
    }

    // ── isEventWindow: EconomicEvent ±30分 HIGH/CRITICAL 判定 ────────────
    let isEventWindow = false;
    try {
      const currencies  = extractCurrencies(symbol);
      const windowStart = new Date(now.getTime() - EVENT_WINDOW_MINUTES * 60_000);
      const windowEnd   = new Date(now.getTime() + EVENT_WINDOW_MINUTES * 60_000);
      const upcoming    = await this.prisma.economicEvent.findFirst({
        where: {
          currency:    { in: currencies },
          scheduledAt: { gte: windowStart, lte: windowEnd },
          importance:  { in: ['HIGH', 'CRITICAL'] as never[] },
        },
      });
      isEventWindow = upcoming != null;
    } catch (err) {
      this.logger.warn(`[Snapshot] isEventWindow 判定失敗: ${String(err)}`);
    }

    // ── isCooldown: 最後の CLOSED trade の exitTime + cooldownMin > now ──
    let isCooldown = false;
    try {
      const lastClosed = await this.prisma.trade.findFirst({
        where:   { userId, status: 'CLOSED', exitTime: { not: null } },
        orderBy: { exitTime: 'desc' },
        select:  { exitTime: true },
      });
      if (lastClosed?.exitTime) {
        const cooldownEnd = new Date(
          lastClosed.exitTime.getTime() + cooldownMin * 60_000,
        );
        isCooldown = cooldownEnd > now;
      }
    } catch (err) {
      this.logger.warn(`[Snapshot] isCooldown 判定失敗: ${String(err)}`);
    }

    // ── isDailyLimit: 本日の trade 数（OPEN + CLOSED）>= maxTrades ────────
    let isDailyLimit = false;
    try {
      const dayStart   = new Date(now);
      dayStart.setUTCHours(0, 0, 0, 0);
      const todayCount = await this.prisma.trade.count({
        where: {
          userId,
          createdAt: { gte: dayStart },
          status:    { in: ['OPEN', 'CLOSED'] as never[] },
        },
      });
      isDailyLimit = todayCount >= maxTrades;
    } catch (err) {
      this.logger.warn(`[Snapshot] isDailyLimit 判定失敗: ${String(err)}`);
    }

    return {
      rr,
      lotSize,
      maxLot:       0,   // 口座残高なし → v5.1 では 0 固定
      isEventWindow,
      isCooldown,
      isDailyLimit,
      forceLock,
    };
  }

  // ── 内部: patterns を PatternDetection から取得 ──────────────────────────

  /**
   * Task3: PatternDetection テーブルから直近 5 件を取得して ScorePattern[] に変換。
   * 新規に pattern 検出器を実装しない。
   * DB に記録がなければ空配列を返す。
   */
  private async loadPatterns(
    userId:    string,
    symbol:    string,
    timeframe: string,
  ): Promise<ScorePattern[]> {
    try {
      const detections = await this.prisma.patternDetection.findMany({
        where:   { userId, symbol, timeframe: timeframe as never },
        orderBy: { detectedAt: 'desc' },
        take:    5,
        select: {
          patternName: true,
          direction:   true,
          confidence:  true,
        },
      });

      return detections.map((d) => ({
        name:       d.patternName,
        direction:  (d.direction === 'BUY' || d.direction === 'SELL')
                      ? d.direction
                      : 'BUY',  // 'NEUTRAL' 等は BUY にフォールバック
        confidence: Number(d.confidence),
        bonus:      PATTERN_BONUS_MAP[d.patternName] ?? 5,
      }));
    } catch (err) {
      this.logger.warn(`[Snapshot] patterns 取得失敗: ${String(err)}`);
      return [];
    }
  }

  // ── POST /api/v1/snapshots/capture ───────────────────────────────────────

  async capture(userId: string, dto: CaptureSnapshotDto) {
    const { symbol, timeframe, asOf } = dto;
    const capturedAt = asOf ? new Date(asOf) : new Date();

    const { scoreThreshold, forceLock, featureSwitches, cooldownMin, maxTrades } =
      await this.loadUserSettings(userId);

    const { ind, isFallback } = await this.loadIndicators(symbol, timeframe);

    if (isFallback) {
      this.logger.warn(`[Snapshot.capture] ${symbol}/${timeframe}: FALLBACK スコア使用`);
    }

    // entryContext: 実データから構成
    const entryCtx = await this.buildEntryContext(
      userId, symbol, cooldownMin, maxTrades, forceLock,
    );

    // patterns: PatternDetection から取得
    const patterns = await this.loadPatterns(userId, symbol, timeframe);

    const scoreResult = calculateScore({
      indicators:      toScoreIndicators(ind),
      patterns,
      mtfAlignment:    {} as MtfAlignment,
      rr:              entryCtx.rr,
      featureSwitches,
    });

    const decision = evaluateEntryDecision({
      score:          scoreResult.total,
      rr:             entryCtx.rr,
      lotSize:        entryCtx.lotSize,
      maxLot:         entryCtx.maxLot,
      isEventWindow:  entryCtx.isEventWindow,
      isCooldown:     entryCtx.isCooldown,
      isDailyLimit:   entryCtx.isDailyLimit,
      forceLock,
      scoreThreshold,
    });

    // DB 保存用 entryContext（isDailyLimit は SnapshotIndicators スキーマ外 → 除外）
    const storedEntryContext = {
      rr:            entryCtx.rr,
      lotSize:       entryCtx.lotSize,
      isEventWindow: entryCtx.isEventWindow,
      isCooldown:    entryCtx.isCooldown,
      forceLock,
    };

    try {
      const snapshot = await this.prisma.snapshot.create({
        data: {
          userId, symbol,
          timeframe:      timeframe as never,
          capturedAt,
          indicators:     toSnapshotIndicators(ind) as never,
          patterns:       patterns as never,
          mtfAlignment:   {},
          scoreTotal:     scoreResult.total,
          scoreBreakdown: scoreResult.breakdown,
          entryState:     decision.status as never,
          entryContext:   storedEntryContext,
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

    const { scoreThreshold, forceLock, featureSwitches, cooldownMin, maxTrades } =
      await this.loadUserSettings(userId);

    const { ind } = await this.loadIndicators(symbol, timeframe);

    const entryCtx = await this.buildEntryContext(
      userId, symbol, cooldownMin, maxTrades, forceLock,
    );

    const patterns = await this.loadPatterns(userId, symbol, timeframe);

    const scoreResult = calculateScore({
      indicators:   toScoreIndicators(ind),
      patterns,
      mtfAlignment: {} as MtfAlignment,
      rr:           entryCtx.rr,
      featureSwitches,
    });

    const decision = evaluateEntryDecision({
      score:         scoreResult.total,
      rr:            entryCtx.rr,
      lotSize:       entryCtx.lotSize,
      maxLot:        entryCtx.maxLot,
      isEventWindow: entryCtx.isEventWindow,
      isCooldown:    entryCtx.isCooldown,
      isDailyLimit:  entryCtx.isDailyLimit,
      forceLock,
      scoreThreshold,
    });

    return this.formatSnapshotRaw({
      id: crypto.randomUUID(), userId, symbol,
      timeframe: timeframe as string, capturedAt,
      indicators:     toSnapshotIndicators(ind),
      patterns,
      mtfAlignment:   {},
      scoreTotal:     scoreResult.total,
      scoreBreakdown: scoreResult.breakdown,
      entryState:     decision.status,
      entryContext: {
        rr:            entryCtx.rr,
        lotSize:       entryCtx.lotSize,
        isEventWindow: entryCtx.isEventWindow,
        isCooldown:    entryCtx.isCooldown,
        forceLock,
      },
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