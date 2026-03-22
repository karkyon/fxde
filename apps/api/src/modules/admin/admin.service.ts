/**
 * apps/api/src/modules/admin/admin.service.ts
 *
 * 参照仕様: SPEC_v51_part3 §13「管理者 API」
 *
 * 実装スコープ (v5.1):
 *   getUsers()       — 全ユーザー一覧（ページネーション）
 *   getUserById()    — ユーザー詳細
 *   updateUserRole() — ロール変更（ADMIN への昇格は DB 直接操作のみ）
 *   getAuditLogs()   — 監査ログ一覧（ページネーション）
 */
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MarketDataService } from '../market-data/market-data.service';
import type { CanonicalTimeframe } from '@fxde/types';

// ADMIN への昇格は DB 直接操作のみ（このAPIでは不可）
// 参照: SPEC_v51_part3 §13
const ASSIGNABLE_ROLES = ['FREE', 'BASIC', 'PRO', 'PRO_PLUS'] as const;
type AssignableRole = typeof ASSIGNABLE_ROLES[number];

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma:      PrismaService,
    private readonly marketData:  MarketDataService,
  ) {}

  // ─────────────────────────────────────────────
  // GET /api/v1/admin/users
  // ─────────────────────────────────────────────
  async getUsers(params: { page?: number; limit?: number }) {
    const page  = params.page  ?? 1;
    const limit = params.limit ?? 20;
    const skip  = (page - 1) * limit;

    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        skip,
        take:    limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id:          true,
          email:       true,
          role:        true,
          status:      true,
          createdAt:   true,
          lastLoginAt: true,
        },
      }),
      this.prisma.user.count(),
    ]);

    return {
      data: users.map((u) => ({
        id:          u.id,
        email:       u.email,
        role:        u.role,
        status:      u.status,
        createdAt:   u.createdAt.toISOString(),
        lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      })),
      total,
      page,
      limit,
    };
  }

  // ─────────────────────────────────────────────
  // GET /api/v1/admin/users/:id
  // ─────────────────────────────────────────────
  async getUserById(id: string) {
    const user = await this.prisma.user.findUnique({
      where:  { id },
      select: {
        id:          true,
        email:       true,
        role:        true,
        status:      true,
        createdAt:   true,
        lastLoginAt: true,
      },
    });
    if (!user) throw new NotFoundException(`User ${id} not found`);

    return {
      id:          user.id,
      email:       user.email,
      role:        user.role,
      status:      user.status,
      createdAt:   user.createdAt.toISOString(),
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    };
  }

  // ─────────────────────────────────────────────
  // PATCH /api/v1/admin/users/:id/role
  // ADMIN への昇格は DB 直接操作のみ
  // 参照: SPEC_v51_part3 §13
  // ─────────────────────────────────────────────
  async updateUserRole(id: string, role: string) {
    if (!(ASSIGNABLE_ROLES as readonly string[]).includes(role)) {
      throw new BadRequestException(
        `role は ${ASSIGNABLE_ROLES.join(' | ')} のいずれかで指定してください。` +
        ' ADMIN への昇格は DB 直接操作のみ。',
      );
    }

    const exists = await this.prisma.user.findUnique({
      where:  { id },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException(`User ${id} not found`);

    const updated = await this.prisma.user.update({
      where:  { id },
      data:   { role: role as AssignableRole },
      select: { id: true, email: true, role: true },
    });

    return updated;
  }

  // ─────────────────────────────────────────────
  // GET /api/v1/admin/audit-logs
  // ─────────────────────────────────────────────
  async getAuditLogs(params: { page?: number; limit?: number }) {
    const page  = params.page  ?? 1;
    const limit = params.limit ?? 50;
    const skip  = (page - 1) * limit;

    const [logs, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        skip,
        take:    limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.auditLog.count(),
    ]);

    return {
      data: logs.map((l) => ({
        id:         l.id,
        userId:     l.userId,
        action:     l.action,
        targetType: l.targetType,
        targetId:   l.targetId,
        metadata:   l.metadata,
        ipAddress:  l.ipAddress,
        createdAt:  l.createdAt.toISOString(),
      })),
      total,
      page,
      limit,
    };
  }

  // ─────────────────────────────────────────────
  // POST /api/v1/admin/market-data/backfill
  // 将来 admin UI から kick するエントリポイント
  // ─────────────────────────────────────────────
  async backfillMarketData(params: {
    symbols:    string[];
    timeframes: string[];
    startDate:  string;
    endDate:    string;
  }) {
    const { symbols, timeframes, startDate, endDate } = params;

    if (!symbols?.length || !timeframes?.length || !startDate || !endDate) {
      throw new BadRequestException(
        'symbols / timeframes / startDate / endDate は必須です',
      );
    }

    const results: Array<{
      symbol: string;
      timeframe: string;
      upserted: number;
      windows: number;
    }> = [];

    for (const symbol of symbols) {
      for (const timeframe of timeframes) {
        const result = await this.marketData.backfillRangeCandles({
          symbol,
          timeframe: timeframe as CanonicalTimeframe,
          startDate,
          endDate,
        });
        results.push({ symbol, timeframe, ...result });
      }
    }

    return {
      status:  'completed',
      results,
      total:   results.reduce((s, r) => s + r.upserted, 0),
    };
  }
}