// apps/api/src/common/decorators/roles.decorator.ts
import { SetMetadata }   from '@nestjs/common';
import type { UserRole } from '@fxde/types';  // index.ts の型を使用

export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);