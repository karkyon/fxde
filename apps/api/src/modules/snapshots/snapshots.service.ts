import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  GetSnapshotsQuery,
  GetSnapshotsLatestQuery,
} from '@fxde/types';

@Injectable()
export class SnapshotsService {
  private readonly logger = new Logger(SnapshotsService.name);

  constructor(private readonly prisma: PrismaService) {}

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