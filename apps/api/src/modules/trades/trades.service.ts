/**
 * apps/api/src/modules/trades/trades.service.ts
 *
 * 変更内容（round8）:
 *   [Task3] getEquityCurve() を追加: GET /api/v1/trades/equity-curve?period=1M|3M|1Y
 *           getStatsSummary() を追加: GET /api/v1/trades/stats/summary
 *           実装方針: 都度 SQL 集計（SPEC_v51_part3 §11）
 *           キャッシュ: Redis 1時間キャッシュ（SPEC準拠）は今フェーズでは省略・TODO
 *
 * 参照仕様: SPEC_v51_part3 §11「集計 API」
 *           SPEC_v51_part7 §1.2「損益曲線 Recharts データ仕様」
 */

import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  CreateTradeInput,
  UpdateTradeInput,
  CloseTradeInput,
  CreateTradeReviewInput,
  GetTradesQueryInput as GetTradesQuery,
} from '@fxde/types';

// Prisma が生成するエnum と一致させる（import はしない: 型整合のため string 比較）
const TradeStatus = { OPEN: 'OPEN', CLOSED: 'CLOSED', CANCELED: 'CANCELED' } as const;

@Injectable()
export class TradesService {
  private readonly logger = new Logger(TradesService.name);

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
        sl:         dto.sl         ?? null,
        tp:         dto.tp         ?? null,
        tags:       dto.tags       ?? [],
        note:       dto.note       ?? null,
        status:     TradeStatus.OPEN,
      },
    });
    return this.format(trade);
  }

  // ─────────────────────────────────────────────
  // FIND ALL
  // ─────────────────────────────────────────────
  async findAll(userId: string, query: GetTradesQuery) {
    const page       = Number(query.page  ?? 1);
    const limit      = Number(query.limit ?? 20);
    const skip       = (page - 1) * limit;
    const includeReview = query.include === 'review';

    const where: Record<string, unknown> = { userId };
    if (query.symbol) where['symbol'] = query.symbol;
    if (query.status) where['status'] = query.status;
    if (query.side)   where['side']   = query.side;

    const [trades, total] = await this.prisma.$transaction([
      this.prisma.trade.findMany({
        where,
        orderBy: { entryTime: 'desc' },
        skip,
        take: limit,
        include: includeReview ? { review: true } : undefined,
      }),
      this.prisma.trade.count({ where }),
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
  // CREATE REVIEW
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
    if (!review) throw new NotFoundException('Review not found');
    return this.formatReview(review);
  }

  // ─────────────────────────────────────────────
  // GET EQUITY CURVE
  // GET /api/v1/trades/equity-curve?period=1M|3M|1Y
  // 参照: SPEC_v51_part3 §11 / SPEC_v51_part7 §1.2
  // ─────────────────────────────────────────────
  async getEquityCurve(userId: string, period: '1M' | '3M' | '1Y' = '1M') {
    // 期間計算
    const now   = new Date();
    const since = new Date(now);
    if (period === '1M') since.setMonth(since.getMonth() - 1);
    else if (period === '3M') since.setMonth(since.getMonth() - 3);
    else since.setFullYear(since.getFullYear() - 1);

    // CLOSED トレードのみ集計
    const trades = await this.prisma.trade.findMany({
      where: {
        userId,
        status:   TradeStatus.CLOSED,
        exitTime: { gte: since },
        pnl:      { not: null },
      },
      orderBy: { exitTime: 'asc' },
      select:  { exitTime: true, pnl: true },
    });

    if (trades.length === 0) {
      return {
        labels:         [],
        balance:        [],
        drawdown:       [],
        startBalance:   0,
        currentBalance: 0,
        totalPnl:       0,
        totalReturnPct: 0,
        mdd:            0,
        cachedAt:       new Date().toISOString(),
      };
    }

    // 累積損益 → 残高 → ドローダウン を計算
    const BASE_BALANCE = 500_000; // 基準口座残高（日本円）
    let runningBalance = BASE_BALANCE;
    let peakBalance    = BASE_BALANCE;
    let mdd            = 0;

    const labels:   string[] = [];
    const balance:  number[] = [];
    const drawdown: number[] = [];

    for (const t of trades) {
      const pnlVal = Number(t.pnl ?? 0);
      runningBalance += pnlVal;
      if (runningBalance > peakBalance) peakBalance = runningBalance;

      const dd = peakBalance > 0
        ? ((runningBalance - peakBalance) / peakBalance) * 100
        : 0;
      if (dd < mdd) mdd = dd;

      const label = t.exitTime
        ? t.exitTime.toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10);

      labels.push(label);
      balance.push(Math.round(runningBalance * 100) / 100);
      drawdown.push(Math.round(dd * 100) / 100);
    }

    const totalPnl        = runningBalance - BASE_BALANCE;
    const totalReturnPct  = BASE_BALANCE > 0 ? (totalPnl / BASE_BALANCE) * 100 : 0;

    return {
      labels,
      balance,
      drawdown,
      startBalance:   BASE_BALANCE,
      currentBalance: runningBalance,
      totalPnl:       Math.round(totalPnl * 100) / 100,
      totalReturnPct: Math.round(totalReturnPct * 100) / 100,
      mdd:            Math.round(mdd * 100) / 100,
      cachedAt:       new Date().toISOString(),
    };
  }

  // ─────────────────────────────────────────────
  // GET STATS SUMMARY
  // GET /api/v1/trades/stats/summary
  // 参照: SPEC_v51_part3 §11 / SPEC_v51_part7 §1.3
  // ─────────────────────────────────────────────
  async getStatsSummary(userId: string) {
    // 当月の CLOSED トレードを集計
    const now         = new Date();
    const monthStart  = new Date(now.getFullYear(), now.getMonth(), 1);

    const trades = await this.prisma.trade.findMany({
      where: {
        userId,
        status:   TradeStatus.CLOSED,
        exitTime: { gte: monthStart },
      },
      select: { pnl: true, exitTime: true },
    });

    const tradeCount  = trades.length;
    const totalPnl    = trades.reduce((sum, t) => sum + Number(t.pnl ?? 0), 0);
    const winCount    = trades.filter((t) => Number(t.pnl ?? 0) > 0).length;
    const winRate     = tradeCount > 0 ? (winCount / tradeCount) * 100 : 0;

    // 最大ドローダウン計算（当月内）
    let peak = 0;
    let maxDd = 0;
    let running = 0;
    for (const t of trades) {
      running += Number(t.pnl ?? 0);
      if (running > peak) peak = running;
      const dd = peak > 0 ? ((running - peak) / peak) * 100 : 0;
      if (dd < maxDd) maxDd = dd;
    }

    // 規律遵守率（disciplined な review の割合）
    // review が存在するトレードのみカウント
    const reviewedTrades = await this.prisma.trade.findMany({
      where: {
        userId,
        status:   TradeStatus.CLOSED,
        exitTime: { gte: monthStart },
        review:   { isNot: null },
      },
      select: { review: { select: { disciplined: true } } },
    });

    const reviewCount      = reviewedTrades.length;
    const disciplinedCount = reviewedTrades.filter((t) => t.review?.disciplined).length;
    const disciplineRate   = reviewCount > 0 ? (disciplinedCount / reviewCount) * 100 : 0;

    // warningMessage: 規律遵守率が 70% を下回る場合に表示
    let warningMessage: string | null = null;
    if (reviewCount > 0 && disciplineRate < 70) {
      warningMessage = `⚠️ 規律遵守率 ${disciplineRate.toFixed(0)}% — 違反が多くなっています`;
    }

    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    return {
      period,
      totalPnl:       Math.round(totalPnl * 100) / 100,
      winRate:        Math.round(winRate * 100) / 100,
      tradeCount,
      maxDd:          Math.round(maxDd * 100) / 100,
      disciplineRate: Math.round(disciplineRate * 100) / 100,
      warningMessage,
    };
  }

  // ─────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────

  private format(trade: {
    id: string; userId: string; symbol: string; side: string;
    entryTime: Date; entryPrice: unknown; exitTime: Date | null;
    exitPrice: unknown; size: unknown; sl: unknown; tp: unknown;
    pnl: unknown; pips: unknown; status: string;
    tags: string[]; note: string | null;
    createdAt: Date; updatedAt: Date;
  }) {
    return {
      id:         trade.id,
      userId:     trade.userId,
      symbol:     trade.symbol,
      side:       trade.side,
      entryTime:  trade.entryTime.toISOString(),
      entryPrice: trade.entryPrice,
      exitTime:   trade.exitTime?.toISOString() ?? null,
      exitPrice:  trade.exitPrice,
      size:       trade.size,
      sl:         trade.sl,
      tp:         trade.tp,
      pnl:        trade.pnl,
      pips:       trade.pips,
      status:     trade.status,
      tags:       trade.tags,
      note:       trade.note,
      createdAt:  trade.createdAt.toISOString(),
      updatedAt:  trade.updatedAt.toISOString(),
    };
  }

  private formatWithReview(trade: ReturnType<TradesService['format']> & { review?: unknown }) {
    return { ...this.format(trade as any), review: trade.review ?? null };
  }

  private formatReview(review: {
    id: string; tradeId: string; scoreAtEntry: number;
    ruleChecks: unknown; psychology: unknown; disciplined: boolean;
    createdAt: Date; updatedAt: Date;
  }) {
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