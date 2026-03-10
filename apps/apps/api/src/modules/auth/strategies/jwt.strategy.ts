// apps/api/src/modules/auth/strategies/jwt.strategy.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy }                  from '@nestjs/passport';
import { ExtractJwt, Strategy }              from 'passport-jwt';
import { ConfigService }                     from '@nestjs/config';
import { PrismaService }                     from '../../../prisma/prisma.service';
import type { JwtPayload }                   from '../../../common/decorators/current-user.decorator';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.status !== 'ACTIVE') throw new UnauthorizedException();
    return { sub: payload.sub, email: payload.email, role: payload.role };
  }
}