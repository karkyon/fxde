// apps/api/src/modules/trades/trades.service.ts
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TradeStatus }   from '@prisma/client';
import {
  CreateTradeInput,
  UpdateTradeInput,
  CloseTradeInput,
  GetTradesQueryInput,
  CreateTradeReviewInput,
} from '@fxde/types';
import { Decimal } from '@prisma/client/runtime/library';

function toNum(v: Decimal | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  return Number(v);
}

@Injectable()
export class TradesService {
  constructor(private readonly prisma: PrismaService) {}

  // ─────────────────────────────────────────────
  // CREATE
  // ─────────────────────────────────────────────
  async create(userId: string, dto: CreateTradeInput) {
    const trade = await this.prisma.trade.create({
      data: {
        userId,
        symbol:     dto.symbol,
        side:       dto.side,
        entryTime:  new Date(dto.entryTime),
        entryPrice: dto.entryPrice,
        size:       dto.size,
        sl:         dto.sl   ?? null,
        tp:         dto.tp   ?? null,
        tags:       dto.tags ?? [],
        note:       dto.note ?? null,
        status:     TradeStatus.OPEN,
      },
    });
    return this.format(trade);
  }

  // ─────────────────────────────────────────────
  // LIST  (include=review 対応 / Part 7 §1.5)
  // ─────────────────────────────────────────────
  async findAll(userId: string, query: GetTradesQueryInput) {
    const {
      page      = 1,
      limit     = 20,
      symbol,
      status,
      side,
      from,
      to,
      sortBy    = 'createdAt',
      sortOrder = 'desc',
      include,
    } = query;

    const where: Record<string, unknown> = { userId };

    if (symbol) where['symbol'] = symbol;
    if (side)   where['side']   = side;

    // status 未指定時は CANCELED を除外
    if (status) {
      where['status'] = status;
    } else {
      where['status'] = { not: TradeStatus.CANCELED };
    }

    if (from || to) {
      where['entryTime'] = {
        ...(from && { gte: new Date(from) }),
        ...(to   && { lte: new Date(to) }),
      };
    }

    const orderBy: Record<string, string> = { [sortBy]: sortOrder };

    // include=review の場合は TradeReview を JOIN
    const includeReview = include === 'review';

    const [total, trades] = await this.prisma.$transaction([
      this.prisma.trade.count({ where }),
      this.prisma.trade.findMany({
        where,
        orderBy,
        skip:    (page - 1) * limit,
        take:    limit,
        include: includeReview ? { review: true } : undefined,
      }),
    ]);

    return {
      data:  trades.map(t => includeReview
        ? this.formatWithReview(t as any)
        : this.format(t)
      ),
      total,
      page,
      limit,
    };
  }

  // ─────────────────────────────────────────────
  // FIND ONE
  // ─────────────────────────────────────────────
  async findOne(userId: string, id: string) {
    const trade = await this.prisma.trade.findUnique({ where: { id } });
    if (!trade)                  throw new NotFoundException(`Trade ${id} not found`);
    if (trade.userId !== userId) throw new ForbiddenException();
    return this.format(trade);
  }

  // ─────────────────────────────────────────────
  // UPDATE  (sl / tp / tags / note)
  // ─────────────────────────────────────────────
  async update(userId: string, id: string, dto: UpdateTradeInput) {
    await this.findOne(userId, id); // 所有権確認

    const trade = await this.prisma.trade.update({
      where: { id },
      data: {
        ...(dto.sl   !== undefined && { sl:   dto.sl }),
        ...(dto.tp   !== undefined && { tp:   dto.tp }),
        ...(dto.tags !== undefined && { tags: dto.tags }),
        ...(dto.note !== undefined && { note: dto.note }),
      },
    });
    return this.format(trade);
  }

  // ─────────────────────────────────────────────
  // CLOSE
  // 状態遷移ルール:
  //   OPEN     → CLOSED ✅
  //   CLOSED   → 400 BadRequest（再クローズ禁止）
  //   CANCELED → 400 BadRequest（キャンセル済みはクローズ不可）
  // ─────────────────────────────────────────────
  async close(userId: string, id: string, dto: CloseTradeInput) {
    const trade = await this.prisma.trade.findUnique({ where: { id } });
    if (!trade)                  throw new NotFoundException(`Trade ${id} not found`);
    if (trade.userId !== userId) throw new ForbiddenException();

    if (trade.status === TradeStatus.CLOSED) {
      throw new BadRequestException('Trade is already closed');
    }
    if (trade.status === TradeStatus.CANCELED) {
      throw new BadRequestException('Canceled trade cannot be closed');
    }

    const updated = await this.prisma.trade.update({
      where: { id },
      data: {
        exitPrice: dto.exitPrice,
        exitTime:  new Date(dto.exitTime),
        pnl:       dto.pnl  ?? null,
        pips:      dto.pips ?? null,
        status:    TradeStatus.CLOSED,
      },
    });
    return this.format(updated);
  }

  // ─────────────────────────────────────────────
  // CANCEL（論理削除: status = CANCELED）
  // 状態遷移ルール:
  //   OPEN     → CANCELED ✅
  //   CANCELED → 400 BadRequest（再キャンセル禁止）
  //   CLOSED   → 400 BadRequest
  //              理由: CLOSED は exitPrice/pnl が確定した完了記録。
  //              事後修正は仕様上定義なし（Part 3/10 とも記述なし）。
  //              誤操作によるデータ破損を防ぐため禁止とする。
  // ─────────────────────────────────────────────
  async cancel(userId: string, id: string) {
    const trade = await this.prisma.trade.findUnique({ where: { id } });
    if (!trade)                  throw new NotFoundException(`Trade ${id} not found`);
    if (trade.userId !== userId) throw new ForbiddenException();

    if (trade.status === TradeStatus.CANCELED) {
      throw new BadRequestException('Trade is already canceled');
    }
    if (trade.status === TradeStatus.CLOSED) {
      throw new BadRequestException(
        'Closed trade cannot be canceled. Closed status is final.',
      );
    }

    const updated = await this.prisma.trade.update({
      where: { id },
      data:  { status: TradeStatus.CANCELED },
    });
    return this.format(updated);
  }

  // ─────────────────────────────────────────────
  // CREATE REVIEW（tradeId @unique → 重複は 409）
  // ─────────────────────────────────────────────
  async createReview(userId: string, tradeId: string, dto: CreateTradeReviewInput) {
    const trade = await this.prisma.trade.findUnique({ where: { id: tradeId } });
    if (!trade)                  throw new NotFoundException(`Trade ${tradeId} not found`);
    if (trade.userId !== userId) throw new ForbiddenException();

    const existing = await this.prisma.tradeReview.findUnique({ where: { tradeId } });
    if (existing) throw new ConflictException('Review already exists for this trade');

    const review = await this.prisma.tradeReview.create({
      data: {
        tradeId,
        scoreAtEntry: dto.scoreAtEntry,
        ruleChecks:   dto.ruleChecks   as object,
        psychology:   (dto.psychology  ?? {}) as object,
        disciplined:  dto.disciplined,
      },
    });
    return this.formatReview(review);
  }

  // ─────────────────────────────────────────────
  // GET REVIEW
  // ─────────────────────────────────────────────
  async getReview(userId: string, tradeId: string) {
    const trade = await this.prisma.trade.findUnique({ where: { id: tradeId } });
    if (!trade)                  throw new NotFoundException(`Trade ${tradeId} not found`);
    if (trade.userId !== userId) throw new ForbiddenException();

    const review = await this.prisma.tradeReview.findUnique({ where: { tradeId } });
    if (!review) throw new NotFoundException('Review not found for this trade');
    return this.formatReview(review);
  }

  // ─────────────────────────────────────────────
  // PRIVATE HELPERS
  // ─────────────────────────────────────────────
  private format(trade: any) {
    return {
      id:         trade.id,
      userId:     trade.userId,
      symbol:     trade.symbol,
      side:       trade.side,
      entryTime:  trade.entryTime.toISOString(),
      entryPrice: toNum(trade.entryPrice),
      exitTime:   trade.exitTime?.toISOString() ?? null,
      exitPrice:  toNum(trade.exitPrice),
      size:       toNum(trade.size),
      sl:         toNum(trade.sl),
      tp:         toNum(trade.tp),
      pnl:        toNum(trade.pnl),
      pips:       toNum(trade.pips),
      status:     trade.status,
      tags:       trade.tags,
      note:       trade.note,
      createdAt:  trade.createdAt.toISOString(),
      updatedAt:  trade.updatedAt.toISOString(),
    };
  }

  // Part 7 §1.5 TradeLogEntry 形式（include=review 時）
  private formatWithReview(trade: any) {
    return {
      ...this.format(trade),
      review: trade.review ? this.formatReview(trade.review) : null,
    };
  }

  private formatReview(review: any) {
    return {
      id:           review.id,
      tradeId:      review.tradeId,
      scoreAtEntry: review.scoreAtEntry,
      ruleChecks:   review.ruleChecks,
      psychology:   review.psychology,
      disciplined:  review.disciplined,
      createdAt:    review.createdAt.toISOString(),
      updatedAt:    review.updatedAt.toISOString(),
    };
  }
}