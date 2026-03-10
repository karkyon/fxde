// apps/api/src/common/guards/roles.guard.ts
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector }   from '@nestjs/core';
import { ROLES_KEY }   from '../decorators/roles.decorator';
import type { UserRole } from '@fxde/types';  // index.ts の型を使用

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) return true;

    const { user } = context
      .switchToHttp()
      .getRequest<{ user: { role: UserRole } }>();

    if (!required.includes(user?.role)) {
      throw new ForbiddenException(
        `この機能は ${required.join(' | ')} のみ利用できます`,
      );
    }

    return true;
  }
}