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

// v5.1: スタブ用デフォルト指標値（実計算は snapshot-capture ワーカーで行う）
const STUB_INDICATORS = {
  ma:   { ma50: 0, ma200: 0, slope: 0, crossStatus: 'NONE' as const },
  rsi:  { value: 50, divergence: false },
  macd: { macdLine: 0, signal: 0, histogram: 0, crossStatus: 'NONE' as const },
  bb:   { upper: 0, mid: 0, lower: 0, bandwidth: 0 },
  atr:  { value: 0, ratio: 1 },
};

const STUB_SCORE_BREAKDOWN = {
  technical:    0,
  fundamental:  0,
  market:       0,
  rr:           0,
  patternBonus: 0,
};

const STUB_ENTRY_CONTEXT = {
  rr:            0,
  lotSize:       0,
  isEventWindow: false,
  isCooldown:    false,
  forceLock:     false,
};

/**
 * entryState から entryDecision を導出する（v5.1 スタブ）
 * 参照: SPEC_v51_part3 §7 SnapshotResponse.entryDecision
 */
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

  constructor(private readonly prisma: PrismaService) {}

  /**
   * POST /api/v1/snapshots/capture
   * スコア計算 + スナップショット保存。
   * v5.1: スタブ固定値を保存する。
   * 参照: SPEC_v51_part3 §7 / SPEC_v51_part4 §5.4
   */
  async capture(userId: string, dto: CaptureSnapshotDto) {
    const { symbol, timeframe, asOf } = dto;
    const capturedAt = asOf ? new Date(asOf) : new Date();

    try {
      const snapshot = await this.prisma.snapshot.create({
        data: {
          userId,
          symbol,
          timeframe:      timeframe as any,
          capturedAt,
          indicators:     STUB_INDICATORS,
          patterns:       [],
          mtfAlignment:   {},
          scoreTotal:     0,
          scoreBreakdown: STUB_SCORE_BREAKDOWN,
          entryState:     'SCORE_LOW',
          entryContext:   STUB_ENTRY_CONTEXT,
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

  /**
   * POST /api/v1/snapshots/evaluate
   * 保存なしのスコア評価のみ。capture と同一 response shape を返す。
   * v5.1: スタブ固定値を返す。
   * 参照: SPEC_v51_part3 §7
   */
  async evaluate(userId: string, dto: EvaluateSnapshotDto) {
    const { symbol, timeframe, asOf } = dto;
    const capturedAt = asOf ? new Date(asOf) : new Date();

    // DB 保存なし・スタブ値で SnapshotResponse 形式を返す
    return this.formatSnapshotRaw({
      id:             crypto.randomUUID(),
      userId,
      symbol,
      timeframe:      timeframe as string,
      capturedAt,
      indicators:     STUB_INDICATORS,
      patterns:       [],
      mtfAlignment:   {},
      scoreTotal:     0,
      scoreBreakdown: STUB_SCORE_BREAKDOWN,
      entryState:     'SCORE_LOW',
      entryContext:   STUB_ENTRY_CONTEXT,
      createdAt:      capturedAt,
    });
  }

  /**
   * GET /api/v1/snapshots/latest
   */
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

  /**
   * GET /api/v1/snapshots/:id
   * 認証ユーザー本人のみ取得可能。他人のデータは 403 を返す。
   * 参照: SPEC_v51_part3 §7
   */
  async getById(userId: string, id: string) {
    const snapshot = await this.prisma.snapshot.findUnique({
      where: { id },
    });

    if (!snapshot) {
      throw new NotFoundException(`Snapshot "${id}" not found`);
    }
    if (snapshot.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    return this.formatSnapshot(snapshot);
  }

  /**
   * GET /api/v1/snapshots
   */
  async getList(userId: string, query: GetSnapshotsQuery) {
    const { page, limit, symbol, timeframe, entryState, from, to } = query;
    const skip = (page - 1) * limit;

    const where = {
      userId,
      ...(symbol     && { symbol }),
      ...(timeframe  && { timeframe: timeframe as any }),
      ...(entryState && { entryState: entryState as any }),
      ...((from || to) && {
        capturedAt: {
          ...(from && { gte: new Date(from) }),
          ...(to   && { lte: new Date(to) }),
        },
      }),
    };

    const [total, items] = await Promise.all([
      this.prisma.snapshot.count({ where }),
      this.prisma.snapshot.findMany({
        where,
        skip,
        take:    limit,
        orderBy: { capturedAt: 'desc' },
      }),
    ]);

    return {
      data:  items.map((s) => this.formatSnapshot(s)),
      total,
      page,
      limit,
    };
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  /** Prisma Snapshot モデル → SnapshotResponse 変換（DB 取得時用）*/
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

  /** SnapshotResponse 形式に整形する共通メソッド（evaluate でも利用）*/
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