/**
 * apps/api/src/modules/snapshots/snapshots.service.ts
 *
 * 変更内容（round8）:
 *   [Task1] capture() メソッドを追加
 *           POST /api/v1/snapshots/capture を処理する
 *           v5.1: スコア計算はスタブ固定値。実計算は snapshot-capture ワーカーで行う。
 *           capturedAt は引数の asOf があればその値、なければ現在時刻を使用。
 *
 * 参照仕様: SPEC_v51_part3 §7「Snapshots API」
 *           SPEC_v51_part4 §5.4「snapshot-capture ワーカー」
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  GetSnapshotsQuery,
  GetSnapshotsLatestQuery,
  CaptureSnapshotDto,
} from '@fxde/types';

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

@Injectable()
export class SnapshotsService {
  private readonly logger = new Logger(SnapshotsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * POST /api/v1/snapshots/capture
   * スコア計算 + 保存。
   * v5.1: 指標・スコアはスタブ固定値。リクエストを受けて DB に保存し、
   *       snapshot-capture キューに処理を委譲するのが本来の設計。
   *       本メソッドでは直接 DB 保存を行うシンプル実装とする。
   */
  async capture(userId: string, dto: CaptureSnapshotDto) {
    const { symbol, timeframe, asOf } = dto;
    const capturedAt = asOf ? new Date(asOf) : new Date();

    this.logger.log(`capture: userId=${userId} symbol=${symbol} tf=${timeframe}`);

    const snapshot = await this.prisma.snapshot.create({
      data: {
        userId,
        symbol,
        timeframe,
        capturedAt,
        indicators:     STUB_INDICATORS,
        patterns:       [],
        mtfAlignment:   {},
        scoreTotal:     0,
        scoreBreakdown: STUB_SCORE_BREAKDOWN,
        entryState:     'SCORE_LOW',
        entryContext: {
          rr:            0,
          lotSize:       0,
          isEventWindow: false,
          isCooldown:    false,
          forceLock:     false,
        },
      },
    });

    return this.formatSnapshot(snapshot);
  }

  /**
   * GET /api/v1/snapshots/latest
   * 認証済みユーザーの最新スナップショットを1件返す。
   * symbol / timeframe でフィルタ可能。
   */
  async getLatest(userId: string, query: GetSnapshotsLatestQuery) {
    const where: Record<string, unknown> = { userId };
    if (query.symbol) where['symbol'] = query.symbol;
    if (query.timeframe) where['timeframe'] = query.timeframe;

    const snapshot = await this.prisma.snapshot.findFirst({
      where,
      orderBy: { capturedAt: 'desc' },
    });

    if (!snapshot) {
      throw new NotFoundException('Snapshot not found');
    }

    return this.formatSnapshot(snapshot);
  }

  /**
   * GET /api/v1/snapshots
   * 認証済みユーザーのスナップショット一覧。
   * ページネーション + symbol / timeframe / entryState / from / to フィルタ。
   */
  async getList(userId: string, query: GetSnapshotsQuery) {
    this.logger.debug(`getList user=${userId} query=${JSON.stringify(query)}`);

    const pageNum  = Number(query.page  ?? 1);
    const limitNum = Number(query.limit ?? 20);
    const skip     = (pageNum - 1) * limitNum;

    const { symbol, timeframe, entryState, from, to } = query;

    const where: Record<string, unknown> = { userId };
    if (symbol)     where['symbol']     = symbol;
    if (timeframe)  where['timeframe']  = timeframe;
    if (entryState) where['entryState'] = entryState;
    if (from || to) {
      where['capturedAt'] = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to   ? { lte: new Date(to)   } : {}),
      };
    }

    this.logger.debug(`getList where=${JSON.stringify(where)} skip=${skip} limit=${limitNum}`);

    try {
      const [snapshots, total] = await this.prisma.$transaction([
        this.prisma.snapshot.findMany({
          where,
          orderBy: { capturedAt: 'desc' },
          skip,
          take: limitNum,
        }),
        this.prisma.snapshot.count({ where }),
      ]);

      return {
        data:  snapshots.map((s) => this.formatSnapshot(s)),
        total,
        page:  pageNum,
        limit: limitNum,
      };
    } catch (error) {
      this.logger.error(
        'Snapshots list failed',
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private formatSnapshot(snapshot: {
    id: string;
    userId: string;
    symbol: string;
    timeframe: string;
    capturedAt: Date;
    indicators: unknown;
    patterns: unknown;
    mtfAlignment: unknown;
    scoreTotal: number;
    scoreBreakdown: unknown;
    entryState: string;
    entryContext: unknown;
    createdAt: Date;
  }) {
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
      entryState:     snapshot.entryState,
      entryContext:   snapshot.entryContext,
      createdAt:      snapshot.createdAt.toISOString(),
    };
  }
}