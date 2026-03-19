/**
 * apps/api/src/modules/snapshots/snapshots.service.ts
 *
 * 役割: Snapshots API のビジネスロジック
 *
 * Task1〜3 変更（2026-03-19 前回）:
 *   - FALLBACK_ENTRY_CONTEXT を廃止
 *   - rr / lotSize / isEventWindow / isCooldown / isDailyLimit を実データから構成
 *   - patterns を PatternDetection テーブルから直近5件取得
 *
 * STEP2〜5 変更（2026-03-19 今回）:
 *   STEP2: getList() capturedAt 条件バグ修正
 *     from と to を別々にスプレッドすると両方指定時に後者が前者を上書きする。
 *     capturedAt オブジェクトをひとつにまとめて渡すよう修正。
 *
 *   STEP3: loadPatterns() direction fallback 修正
 *     PatternDetection.direction は VarChar(10) = String 型（enum なし）。
 *     実際に格納される値: 'BUY' | 'SELL' | 'NEUTRAL'（plugin-runtime より）。
 *     ScorePattern.direction は 'BUY' | 'SELL' のみ（score-engine 正本）。
 *     'NEUTRAL' 等の BUY/SELL 以外を 'BUY' に変換するのは意味を壊す。
 *     → BUY/SELL 以外は filter で除外する（score に影響させない）。
 *
 *   STEP4: FALLBACK_INDICATORS 使用条件の明文化
 *     fallback は「indicator_cache が DB に存在しない場合の最後の安全網」に限定。
 *     通常の price-sync → syncIndicators() 経路が動いていれば使用されないはず。
 *     fallback 使用時は warn ログを出してスコアが 0 に近い旨を明示済み。
 *
 *   STEP5: maxLot の一貫性整理
 *     maxLot は v5.1 仕様境界として 0 固定。
 *     理由: 口座残高・証拠金情報が DB に存在しないため計算不能。
 *     evaluateEntryDecision は maxLot=0 かつ lotSize>0 でも RISK_NG にならない
 *     （entry-decision.ts: maxLot > 0 && lotSize > maxLot の場合のみ RISK_NG）。
 *     → lotSize <= maxLot(=0) は常に false なので RISK_NG にはならない。正しい動作。
 *     将来 v6 で account API と接続する際はここを差し替える。
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
import type { EntryState }                       from '@fxde/types';
import { calculateScore, evaluateEntryDecision } from '@fxde/shared';
import type { ScoreIndicators, MtfAlignment, ScorePattern } from '@fxde/shared';
import { SettingsService }                       from '../settings/settings.service';
import type { IndicatorCacheShape }              from '../market-data/indicator-engine.service';

// ── FALLBACK_INDICATORS ───────────────────────────────────────────────────────
// 使用条件: indicator_cache テーブルに指定 symbol×timeframe のレコードが存在しない時のみ。
// 通常は price-sync → syncIndicators() が動いていれば indicator_cache に書き込まれるため
// このフォールバックは「初回起動直後」か「provider 未設定時」のみ発動する。
// fallback 使用時はスコアが 0 に近い値（全ゼロ指標のため）になる。これは意図的。
// → dashboard / chart が「データ未準備」を示す機会になる。
const FALLBACK_INDICATORS: IndicatorCacheShape = {
  ma:   { ma50: 0, ma200: 0, slope: 0, crossStatus: 'NONE', value: 0, status: 'neutral' },
  rsi:  { value: 50, divergence: false, status: 'neutral' },
  macd: { macdLine: 0, signal: 0, histogram: 0, crossStatus: 'NONE', macd: 0, status: 'neutral' },
  bb:   { upper: 0, mid: 0, lower: 0, bandwidth: 0, middle: 0, position: 'unknown', status: 'neutral' },
  atr:  { value: 0, ratio: 1, status: 'normal' },
  bias: { direction: 'neutral', strength: 'weak', label: 'Bias: neutral weak', status: 'neutral' },
};

// ── EventWindow 判定用の時間幅（分）─────────────────────────────────────────
const EVENT_WINDOW_MINUTES = 30;

// ── 設定デフォルト値（settings 未設定時）────────────────────────────────────
const DEFAULT_MAX_TRADES   = 5;
const DEFAULT_COOLDOWN_MIN = 60;

// ── maxLot: v5.1 仕様境界で 0 固定 ──────────────────────────────────────────
// 口座残高・証拠金情報が DB に存在しないため計算不能。
// evaluateEntryDecision は (maxLot > 0 && lotSize > maxLot) のみ RISK_NG にする仕様のため
// maxLot=0 は lotSize がいくらあっても RISK_NG にならない。これは v5.1 仕様境界として正しい動作。
// v6 で account API と接続する際はここを差し替えること。
const MAX_LOT_V51 = 0;

// ── PatternDetection.direction の正式な取りうる値 ────────────────────────────
// schema.prisma: direction String @db.VarChar(10) → enum なし / String 型
// plugin-runtime で格納される値: 'BUY' | 'SELL' | 'NEUTRAL'
// score-engine の ScorePattern.direction: 'BUY' | 'SELL' のみ許容
// → 'NEUTRAL' 等の BUY/SELL 以外は ScorePattern に変換できないため除外する（score に影響させない）
const VALID_PATTERN_DIRECTIONS = new Set(['BUY', 'SELL'] as const);

// ── pattern_detections → ScorePattern 変換用定数 ────────────────────────────
// SPEC_v51_part6 §1.0 正式名称から bonus 値のデフォルトマッピング
const PATTERN_BONUS_MAP: Record<string, number> = {
  HeadAndShoulders:        12,
  InverseHeadAndShoulders: 12,
  DoubleTop:               10,
  DoubleBottom:            10,
  Triangle:                 8,
  Channel:                  8,
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

function extractCurrencies(symbol: string): string[] {
  const s = symbol.toUpperCase();
  if (s.length === 6) return [s.slice(0, 3), s.slice(3)];
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
  // STEP4: fallback 使用条件を明示
  // fallback は「indicator_cache が DB に存在しない場合の最後の安全網」のみ

  private async loadIndicators(symbol: string, timeframe: string) {
    const cached = await this.prisma.indicatorCache.findFirst({
      where:   { symbol, timeframe: timeframe as never },
      orderBy: { calculatedAt: 'desc' },
    });
    if (!cached) {
      // fallback 使用: price-sync が未実行か provider 未設定の状態。スコアは 0 に近い値になる。
      this.logger.warn(
        `[Snapshot] indicator_cache 未存在 ${symbol}/${timeframe} → ` +
        `FALLBACK 使用（price-sync / indicator-engine が動作していない可能性あり）`,
      );
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
      const rp = s.riskProfile as { cooldownMin?: number; maxTrades?: number } | null;
      if (rp) {
        cooldownMin = rp.cooldownMin ?? DEFAULT_COOLDOWN_MIN;
        maxTrades   = rp.maxTrades   ?? DEFAULT_MAX_TRADES;
      }
    } catch { /* SETTINGS_NOT_FOUND: デフォルト値で続行 */ }
    return { scoreThreshold, forceLock, featureSwitches, cooldownMin, maxTrades };
  }

  // ── 内部: entryContext を実データから構成 ────────────────────────────────

  private async buildEntryContext(
    userId:     string,
    symbol:     string,
    cooldownMin: number,
    maxTrades:  number,
    forceLock:  boolean,
  ) {
    const now = new Date();

    // rr / lotSize: OPEN trade の sl/tp/size から計算
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
        rr = Math.round((Math.abs(tp - entry) / Math.abs(entry - sl)) * 100) / 100;
      }
    }

    // isEventWindow: EconomicEvent ±30分 HIGH/CRITICAL 判定
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

    // isCooldown: 最後の CLOSED trade exitTime + cooldownMin > now
    let isCooldown = false;
    try {
      const lastClosed = await this.prisma.trade.findFirst({
        where:   { userId, status: 'CLOSED', exitTime: { not: null } },
        orderBy: { exitTime: 'desc' },
        select:  { exitTime: true },
      });
      if (lastClosed?.exitTime) {
        const cooldownEnd = new Date(lastClosed.exitTime.getTime() + cooldownMin * 60_000);
        isCooldown = cooldownEnd > now;
      }
    } catch (err) {
      this.logger.warn(`[Snapshot] isCooldown 判定失敗: ${String(err)}`);
    }

    // isDailyLimit: 本日の trade 数 >= maxTrades
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
      // STEP5: maxLot は v5.1 仕様境界で 0 固定（口座残高なし）
      // evaluateEntryDecision は (maxLot > 0 && lotSize > maxLot) のみ RISK_NG にする。
      // maxLot=0 は常に条件を満たさないため RISK_NG にならない。v5.1 で意図的な動作。
      maxLot: MAX_LOT_V51,
      isEventWindow,
      isCooldown,
      isDailyLimit,
      forceLock,
    };
  }

  // ── 内部: patterns を PatternDetection から取得 ──────────────────────────
  // STEP3: direction fallback 修正
  // PatternDetection.direction は String @db.VarChar(10)（enum なし）。
  // 格納される値: 'BUY' | 'SELL' | 'NEUTRAL'。
  // ScorePattern.direction は 'BUY' | 'SELL' のみ許容（score-engine 正本）。
  // 'NEUTRAL' 等 BUY/SELL 以外 → ScorePattern に変換不能のため filter で除外する。
  // 除外されたレコードは score に影響しない（patternBonus = 0 と同等）。

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

      const valid = detections.filter((d) =>
        VALID_PATTERN_DIRECTIONS.has(d.direction as 'BUY' | 'SELL'),
      );

      if (valid.length < detections.length) {
        this.logger.debug(
          `[Snapshot] loadPatterns: ${detections.length - valid.length} 件を除外 ` +
          `(direction が BUY/SELL 以外)`,
        );
      }

      return valid.map((d) => ({
        name:       d.patternName,
        direction:  d.direction as 'BUY' | 'SELL',  // filter 済みのため安全
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
      this.logger.warn(
        `[Snapshot.capture] ${symbol}/${timeframe}: indicator_cache 未存在のため FALLBACK スコア使用。` +
        `scoreTotal が 0 に近い値になります。`,
      );
    }

    const entryCtx = await this.buildEntryContext(
      userId, symbol, cooldownMin, maxTrades, forceLock,
    );
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

  /**
   * STEP2 修正: capturedAt の from/to 条件をひとつのオブジェクトにまとめる。
   *
   * 旧実装の問題:
   *   ...(from && { capturedAt: { gte: new Date(from) } }),
   *   ...(to   && { capturedAt: { lte: new Date(to) } }),
   *   → from と to を両方指定すると後者が前者を上書きする（Prisma where の Object.assign 相当）。
   *   → from+to 両指定時に `{ capturedAt: { lte: to } }` のみが残り from 条件が消える静かなバグ。
   *
   * 新実装:
   *   capturedAt オブジェクトをひとつにまとめてから where に渡す。
   *   ケース別動作:
   *     from のみ  → { capturedAt: { gte: from } }
   *     to のみ    → { capturedAt: { lte: to } }
   *     両方指定   → { capturedAt: { gte: from, lte: to } }
   *     どちらもなし → capturedAt 条件なし
   */
  async getList(userId: string, query: GetSnapshotsQuery) {
    const { symbol, timeframe, entryState, from, to, page, limit } = query;

    // STEP2: capturedAt をひとつのオブジェクトにまとめる
    const capturedAt =
      from || to
        ? {
            ...(from ? { gte: new Date(from) } : {}),
            ...(to   ? { lte: new Date(to) }   : {}),
          }
        : undefined;

    const where = {
      userId,
      ...(symbol     && { symbol }),
      ...(timeframe  && { timeframe: timeframe as never }),
      ...(entryState && { entryState: entryState as never }),
      ...(capturedAt && { capturedAt }),
    };

    const [data, total] = await Promise.all([
      this.prisma.snapshot.findMany({
        where,
        orderBy: { capturedAt: 'desc' },
        skip:    (page - 1) * limit,
        take:    limit,
      }),
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