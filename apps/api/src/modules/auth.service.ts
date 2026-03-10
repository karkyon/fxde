// apps/api/src/modules/auth/auth.service.ts
import {
  Injectable,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService }    from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt       from 'bcryptjs';
import type { Response, Request } from 'express';
// ★ クラスではなく Zod 推論型を使用
import type { RegisterDto, LoginDto } from '@fxde/types/schemas';
import type { JwtPayload } from '../../common/decorators/current-user.decorator';

const BCRYPT_ROUNDS  = 12;
const RT_COOKIE_NAME = 'refresh_token';
const AT_EXPIRES_IN  = '15m';
const RT_EXPIRES_IN  = '7d';
const RT_MAX_AGE_MS  = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma:  PrismaService,
    private readonly jwt:     JwtService,
    private readonly config:  ConfigService,
  ) {}

  async register(dto: RegisterDto, res: Response, req: Request) {
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) throw new ConflictException('ALREADY_EXISTS');

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = await this.prisma.user.create({
      data: { email: dto.email, passwordHash },
    });

    return this.issueTokens(user, res, req);
  }

  async login(dto: LoginDto, res: Response, req: Request) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('INVALID_CREDENTIALS');
    }
    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('ACCOUNT_SUSPENDED');
    }

    void this.prisma.user.update({
      where: { id: user.id },
      data:  { lastLoginAt: new Date() },
    });

    return this.issueTokens(user, res, req);
  }

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
      !(await bcrypt.compare(rawRt, session.refreshTokenHash))
    ) {
      throw new UnauthorizedException('REFRESH_TOKEN_EXPIRED');
    }

    const accessToken = this.signAccessToken(session.user);
    return { accessToken };
  }

  async logout(userId: string, res: Response) {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data:  { revokedAt: new Date() },
    });
    this.clearRtCookie(res);
    return { success: true as const };
  }

  private async issueTokens(
    user: { id: string; email: string; role: string },
    res: Response,
    req: Request,
  ) {
    const accessToken = this.signAccessToken(user);
    const expiresAt   = new Date(Date.now() + RT_MAX_AGE_MS);

    const session = await this.prisma.session.create({
      data: {
        userId:           user.id,
        refreshTokenHash: 'placeholder',
        expiresAt,
        userAgent: (req.headers['user-agent'] as string) ?? null,
        ipAddress: (req.ip as string) ?? null,
      },
    });

    const rawRt  = this.signRefreshToken(user.id, session.id);
    const rtHash = await bcrypt.hash(rawRt, BCRYPT_ROUNDS);

    await this.prisma.session.update({
      where: { id: session.id },
      data:  { refreshTokenHash: rtHash },
    });

    this.setRtCookie(res, rawRt);

    return {
      accessToken,
      user: { id: user.id, email: user.email, role: user.role },
    };
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
      { secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'), expiresIn: RT_EXPIRES_IN },
    );
  }

  private setRtCookie(res: Response, token: string): void {
    res.cookie(RT_COOKIE_NAME, token, {
      httpOnly: true,
      secure:   this.config.get('NODE_ENV') === 'production',
      sameSite: 'strict',
      maxAge:   RT_MAX_AGE_MS,
      path:     '/',
    });
  }

  private clearRtCookie(res: Response): void {
    res.cookie(RT_COOKIE_NAME, '', {
      httpOnly: true,
      secure:   this.config.get('NODE_ENV') === 'production',
      sameSite: 'strict',
      maxAge:   0,
      path:     '/',
    });
  }
}