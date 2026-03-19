// apps/api/src/modules/auth/auth.service.ts
import {
  Injectable,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService }    from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import * as argon2       from 'argon2';
import type { Prisma }   from '@prisma/client';
import type { Response, Request } from 'express';
import type { RegisterDto, LoginDto } from '@fxde/types';
import type { JwtPayload } from '../../common/decorators/current-user.decorator';

// ──────────────────────────────────────────────
// 定数
// ──────────────────────────────────────────────
const RT_COOKIE_NAME = 'refresh_token';
const AT_EXPIRES_IN  = '15m';
const RT_EXPIRES_IN  = '7d';
const RT_MAX_AGE_MS  = 7 * 24 * 60 * 60 * 1000;

/**
 * Argon2id オプション（仕様: SPEC_v51_part4 §4.5）
 * OWASP 推奨値: m=65536, t=3, p=4
 */
const ARGON2_OPTIONS: argon2.Options & { raw?: false } = {
  type:        argon2.argon2id,
  memoryCost:  65536,  // 64 MiB
  timeCost:    3,
  parallelism: 4,
};

// ──────────────────────────────────────────────

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma:  PrismaService,
    private readonly jwt:     JwtService,
    private readonly config:  ConfigService,
  ) {}

  // ────────────────────────────────────────────
  // register
  // ────────────────────────────────────────────
  async register(dto: RegisterDto, res: Response, req: Request) {
    const exists = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (exists) throw new ConflictException('ALREADY_EXISTS');

    const passwordHash = await argon2.hash(dto.password, ARGON2_OPTIONS);

    // ★ user 作成 + session 作成 + UserSetting 作成 を1トランザクションで実行
    const { user, rawRt } = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email: dto.email, passwordHash },
      });

      // UserSetting を同時に作成（登録直後から設定が存在することを保証）
      await tx.userSetting.create({
        data: { userId: user.id },
      });

      const { session, rawRt } = await this._createSession(tx, user, req);
      void session; // session は tx 内で確定済み
      return { user, rawRt };
    });

    const accessToken = this.signAccessToken(user);
    this.setRtCookie(res, rawRt);

    return {
      accessToken,
      user: { id: user.id, email: user.email, role: user.role },
    };
  }

  // ────────────────────────────────────────────
  // login
  // ────────────────────────────────────────────
  async login(dto: LoginDto, res: Response, req: Request) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user || !(await argon2.verify(user.passwordHash, dto.password))) {
      throw new UnauthorizedException('INVALID_CREDENTIALS');
    }
    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('ACCOUNT_SUSPENDED');
    }

    // ★ lastLoginAt 更新 + session 作成 を1トランザクションで実行
    const { updatedUser, rawRt } = await this.prisma.$transaction(async (tx) => {
      const updatedUser = await tx.user.update({
        where: { id: user.id },
        data:  { lastLoginAt: new Date() },
      });
      const { rawRt } = await this._createSession(tx, user, req);
      return { updatedUser, rawRt };
    });

    const accessToken = this.signAccessToken(updatedUser);
    this.setRtCookie(res, rawRt);

    return {
      accessToken,
      user: { id: updatedUser.id, email: updatedUser.email, role: updatedUser.role },
    };
  }

  // ────────────────────────────────────────────
  // refresh
  // ────────────────────────────────────────────
  async refresh(req: Request, res: Response) {
    const rawRt = (req.cookies as Record<string, string>)?.[RT_COOKIE_NAME];
    if (!rawRt) throw new UnauthorizedException('REFRESH_TOKEN_MISSING');

    let payload: { sub: string; sessionId: string };
    try {
      payload = this.jwt.verify(rawRt, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      }) as { sub: string; sessionId: string };
    } catch {
      throw new UnauthorizedException('REFRESH_TOKEN_EXPIRED');
    }

    const session = await this.prisma.session.findUnique({
      where:   { id: payload.sessionId },
      include: { user: true },
    });

    if (
      !session ||
      session.revokedAt ||
      session.expiresAt < new Date() ||
      !(await argon2.verify(session.refreshTokenHash, rawRt))
    ) {
      throw new UnauthorizedException('REFRESH_TOKEN_EXPIRED');
    }

    const accessToken = this.signAccessToken(session.user);
    return { accessToken };
  }

  // ────────────────────────────────────────────
  // logout
  // ────────────────────────────────────────────
  async logout(userId: string, res: Response) {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data:  { revokedAt: new Date() },
    });
    this.clearRtCookie(res);
    return { success: true as const };
  }

  // ────────────────────────────────────────────
  // private helpers
  // ────────────────────────────────────────────

  /**
   * トランザクション内でセッションを生成し rawRt を返す。
   * session.create は1回のみ（placeholder パターンを廃止）。
   *
   * @param tx  Prisma Transaction Client
   * @param user  { id, email, role }
   * @param req  Express Request（userAgent / ipAddress 取得用）
   */
  private async _createSession(
    tx: Prisma.TransactionClient,
    user: { id: string; email: string; role: string },
    req: Request,
  ): Promise<{ session: { id: string }; rawRt: string }> {
    // 先にトークンを生成する（セッションIDは UUID が必要）
    // → ダミーセッションを作らず、UUIDv4 を事前生成してから1回で insert
    const { v4: uuidv4 } = await import('uuid');
    const sessionId  = uuidv4();
    const expiresAt  = new Date(Date.now() + RT_MAX_AGE_MS);
    const rawRt      = this.signRefreshToken(user.id, sessionId);
    const rtHash     = await argon2.hash(rawRt, ARGON2_OPTIONS);

    const session = await tx.session.create({
      data: {
        id:               sessionId,
        userId:           user.id,
        refreshTokenHash: rtHash,
        expiresAt,
        userAgent: (req.headers['user-agent'] as string) ?? null,
        ipAddress: (req.ip as string) ?? null,
      },
    });

    return { session, rawRt };
  }

  private signAccessToken(user: { id: string; email: string; role: string }): string {
    const payload: Omit<JwtPayload, 'iat' | 'exp'> = {
      sub: user.id, email: user.email, role: user.role,
    };
    return this.jwt.sign(payload, {
      secret:    this.config.getOrThrow<string>('JWT_SECRET'),
      expiresIn: AT_EXPIRES_IN,
    });
  }

  private signRefreshToken(userId: string, sessionId: string): string {
    return this.jwt.sign(
      { sub: userId, sessionId },
      {
        secret:    this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: RT_EXPIRES_IN,
      },
    );
  }

  /**
   * RT Cookie の secure フラグ判定
   *
   * 仕様: SPEC_v51_part4 §4.5「本番環境は HTTPS 必須。
   *       v5 開発環境は localhost のみ HTTP 許可」
   *
   * ポリシー（一箇所で一元管理）:
   *   NODE_ENV=development → secure=false（localhost HTTP 開発許可）
   *   NODE_ENV=production  → secure=true（HTTPS 必須）
   *
   * ⚠️ setRtCookie / clearRtCookie の両方がこの getter を参照する。
   *    cookie の secure 設定をここ以外で記述してはならない。
   */
  private get isSecureCookie(): boolean {
    return this.config.get<string>('NODE_ENV') !== 'development';
  }

  private setRtCookie(res: Response, token: string): void {
    res.cookie(RT_COOKIE_NAME, token, {
      httpOnly: true,
      secure:   this.isSecureCookie,
      sameSite: 'strict',
      maxAge:   RT_MAX_AGE_MS,
      path:     '/',
    });
  }

  private clearRtCookie(res: Response): void {
    res.cookie(RT_COOKIE_NAME, '', {
      httpOnly: true,
      secure:   this.isSecureCookie,
      sameSite: 'strict',
      maxAge:   0,
      path:     '/',
    });
  }
}