// apps/api/src/modules/signals/signals.service.ts
import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { GetSignalsQuery, GetSignalsLatestQuery } from '@fxde/types';

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

    // ── where 構築 ────────────────────────────
    // userId は必須（自分のデータのみ返却）
    const where: Record<string, unknown> = { userId };

    // symbol: String 型フィールドへの直接比較
    if (query.symbol)    where['symbol']    = query.symbol;

    // timeframe: Timeframe enum フィールド
    if (query.timeframe) where['timeframe'] = query.timeframe;

    // type: SignalType enum フィールド
    if (query.type)      where['type']      = query.type;

    // unacknowledgedOnly: acknowledgedAt IS NULL でフィルタ
    if (query.unacknowledgedOnly) {
      where['acknowledgedAt'] = null;
    }

    // from / to: triggeredAt でフィルタ（仕様: SPEC_v51_part3 §9）
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
          orderBy: { triggeredAt: 'desc' },
          skip,
          take: limitNum,
        }),
        this.prisma.signal.count({ where }),
      ]);

      this.logger.debug(`findAll: total=${total}`);

      return {
        data:  signals,
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
      orderBy: { triggeredAt: 'desc' },
    });

    if (!signal) {
      this.logger.debug('findLatest: Signal not found');
      throw new NotFoundException('Signal not found');
    }

    this.logger.debug(`findLatest: found id=${signal.id}`);
    return signal;
  }

  // ─────────────────────────────────────────────
  // PATCH /signals/:id/ack  (既読化)
  // 参照: SPEC_v51_part3 §9
  // ─────────────────────────────────────────────
  async acknowledge(userId: string, id: string) {
    const signal = await this.prisma.signal.findUnique({ where: { id } });

    if (!signal) {
      throw new NotFoundException(`Signal ${id} not found`);
    }
    if (signal.userId !== userId) {
      throw new ForbiddenException();
    }

    // 既に acknowledge 済みでも冪等に処理（上書き不可にはしない）
    const updated = await this.prisma.signal.update({
      where: { id },
      data:  { acknowledgedAt: new Date() },
    });

    this.logger.debug(`acknowledge: id=${id} acknowledgedAt=${updated.acknowledgedAt}`);
    return updated;
  }
}