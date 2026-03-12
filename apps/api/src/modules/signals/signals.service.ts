import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { GetSignalsQueryDto, GetLatestSignalQueryDto } from './dto/signals.dto';

@Injectable()
export class SignalsService {
  private readonly logger = new Logger(SignalsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: GetSignalsQueryDto) {
    const pageNum  = Number(query.page  ?? 1);
    const limitNum = Number(query.limit ?? 20);
    const skip     = (pageNum - 1) * limitNum;

    // ⚠️ signalType は GetSignalsQueryDto に存在しないため除去
    this.logger.debug(
      `findAll: page=${pageNum} limit=${limitNum} symbol=${query.symbol ?? '-'} ` +
      `timeframe=${query.timeframe ?? '-'}`,
    );

    const where: Record<string, unknown> = {};

    if (query.symbol) {
      where.symbol = { name: query.symbol };
    }

    if (query.from || query.to) {
      where.createdAt = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to   ? { lte: new Date(query.to)   } : {}),
      };
    }

    try {
      const [data, total] = await this.prisma.$transaction([
        this.prisma.signal.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limitNum,
        }),
        this.prisma.signal.count({ where }),
      ]);

      this.logger.debug(`findAll: total=${total}`);

      return {
        data,
        total,
        page:  pageNum,
        limit: limitNum,
      };
    } catch (error) {
      this.logger.error('findAll failed', error);
      throw error;
    }
  }

  async findLatest(query: GetLatestSignalQueryDto) {
    this.logger.debug(
      `findLatest: symbol=${query.symbol ?? '-'} timeframe=${query.timeframe ?? '-'}`,
    );

    const where: Record<string, unknown> = {};

    if (query.symbol) {
      where.symbol = { name: query.symbol };
    }

    try {
      const signal = await this.prisma.signal.findFirst({
        where,
        orderBy: { createdAt: 'desc' },
      });

      if (!signal) {
        this.logger.debug('findLatest: Signal not found');
        throw new NotFoundException('Signal not found');
      }

      this.logger.debug(`findLatest: found id=${signal.id}`);
      return signal;
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error('findLatest failed', error);
      throw error;
    }
  }
}