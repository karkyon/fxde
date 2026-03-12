// apps/api/src/modules/signals/signals.service.ts
import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { GetSignalsQuery, GetSignalsLatestQuery } from '@fxde/types';

// Prisma include 定義（snapshot.id / scoreTotal / entryState のみ select）
const SIGNAL_INCLUDE = {
  snapshot: {
    select: {
      id:         true,
      scoreTotal: true,
      entryState: true,
    },
  },
} as const;

@Injectable()
export class SignalsService {
  private readonly logger = new Logger(SignalsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─────────────────────────────────────────────
  // GET /signals  (一覧 + ページネーション)
  // ─────────────────────────────────────────────
  async findAll(userId: string, query: GetSignalsQuery) {
    const pageNum  = Number(query.page  ?? 1);
    const limitNum = Number(query.limit ?? 20);
    const skip     = (pageNum - 1) * limitNum;

    this.logger.debug(
      `findAll user=${userId} page=${pageNum} limit=${limitNum} ` +
      `symbol=${query.symbol ?? '-'} type=${query.type ?? '-'}`,
    );

    const where: Record<string, unknown> = { userId };

    if (query.symbol)             where['symbol']         = query.symbol;
    if (query.timeframe)          where['timeframe']      = query.timeframe;
    if (query.type)               where['type']           = query.type;
    if (query.unacknowledgedOnly) where['acknowledgedAt'] = null;

    if (query.from || query.to) {
      where['triggeredAt'] = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to   ? { lte: new Date(query.to)   } : {}),
      };
    }

    try {
      const [signals, total] = await this.prisma.$transaction([
        this.prisma.signal.findMany({
          where,
          include:  SIGNAL_INCLUDE,
          orderBy:  { triggeredAt: 'desc' },
          skip,
          take: limitNum,
        }),
        this.prisma.signal.count({ where }),
      ]);

      this.logger.debug(`findAll: total=${total}`);

      return {
        data:  signals.map((s) => this.format(s)),
        total,
        page:  pageNum,
        limit: limitNum,
      };
    } catch (error) {
      this.logger.error('findAll failed', error);
      throw error;
    }
  }

  // ─────────────────────────────────────────────
  // GET /signals/latest  (単一 / 404 あり)
  // ─────────────────────────────────────────────
  async findLatest(userId: string, query: GetSignalsLatestQuery) {
    this.logger.debug(
      `findLatest user=${userId} symbol=${query.symbol ?? '-'} ` +
      `timeframe=${query.timeframe ?? '-'}`,
    );

    const where: Record<string, unknown> = { userId };
    if (query.symbol)    where['symbol']    = query.symbol;
    if (query.timeframe) where['timeframe'] = query.timeframe;

    const signal = await this.prisma.signal.findFirst({
      where,
      include:  SIGNAL_INCLUDE,
      orderBy:  { triggeredAt: 'desc' },
    });

    if (!signal) {
      this.logger.debug('findLatest: Signal not found');
      throw new NotFoundException('Signal not found');
    }

    this.logger.debug(`findLatest: found id=${signal.id}`);
    return this.format(signal);
  }

  // ─────────────────────────────────────────────
  // POST /signals/:id/ack  (既読化)
  // 参照: SPEC_v51_part3 §9 — POST 確定
  // ─────────────────────────────────────────────
  async acknowledge(userId: string, id: string) {
    const signal = await this.prisma.signal.findUnique({
      where:   { id },
      include: SIGNAL_INCLUDE,
    });

    if (!signal) {
      throw new NotFoundException(`Signal ${id} not found`);
    }
    if (signal.userId !== userId) {
      throw new ForbiddenException();
    }

    const updated = await this.prisma.signal.update({
      where:   { id },
      data:    { acknowledgedAt: new Date() },
      include: SIGNAL_INCLUDE,
    });

    this.logger.debug(`acknowledge: id=${id} acknowledgedAt=${updated.acknowledgedAt}`);
    return this.format(updated);
  }

  // ─────────────────────────────────────────────
  // Private helper: Prisma Signal → SignalResponse
  // ─────────────────────────────────────────────
  private format(signal: {
    id: string;
    symbol: string;
    timeframe: string;
    type: string;
    triggeredAt: Date;
    acknowledgedAt: Date | null;
    metadata: unknown;
    snapshot: { id: string; scoreTotal: number; entryState: string };
  }) {
    return {
      id:             signal.id,
      symbol:         signal.symbol,
      timeframe:      signal.timeframe,
      type:           signal.type,
      triggeredAt:    signal.triggeredAt.toISOString(),
      acknowledgedAt: signal.acknowledgedAt?.toISOString() ?? null,
      metadata:       signal.metadata as Record<string, unknown>,
      snapshot: {
        id:         signal.snapshot.id,
        scoreTotal: signal.snapshot.scoreTotal,
        entryState: signal.snapshot.entryState,
      },
    };
  }
}