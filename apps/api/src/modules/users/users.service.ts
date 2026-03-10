// apps/api/src/modules/users/users.service.ts
import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as argon2       from 'argon2';
import type { UpdateUserDto } from '@fxde/types';

/**
 * Argon2id オプション（仕様: SPEC_v51_part4 §4.5）
 * auth.service.ts と同一設定で統一
 */
const ARGON2_OPTIONS: argon2.Options & { raw?: false } = {
  type:        argon2.argon2id,
  memoryCost:  65536,
  timeCost:    3,
  parallelism: 4,
};

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id:          true,
        email:       true,
        role:        true,
        status:      true,
        createdAt:   true,
        lastLoginAt: true,
      },
    });
    if (!user) throw new NotFoundException('USER_NOT_FOUND');
    return user;
  }

  async updateMe(userId: string, dto: UpdateUserDto) {
    // メールアドレス変更時: 重複チェック
    if (dto.email) {
      const exists = await this.prisma.user.findFirst({
        where: { email: dto.email, NOT: { id: userId } },
      });
      if (exists) throw new ConflictException('EMAIL_ALREADY_TAKEN');
    }

    const data: Record<string, unknown> = {};
    if (dto.email)    data['email']        = dto.email;
    if (dto.password) data['passwordHash'] = await argon2.hash(dto.password, ARGON2_OPTIONS);

    const user = await this.prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id:          true,
        email:       true,
        role:        true,
        status:      true,
        createdAt:   true,
        lastLoginAt: true,
      },
    });
    return user;
  }
}