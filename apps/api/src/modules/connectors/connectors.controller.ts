/**
 * apps/api/src/modules/connectors/connectors.controller.ts
 *
 * 参照仕様: SPEC_v51_part3 §12
 *   GET  /api/v1/connectors/status   全ロール
 *   POST /api/v1/connectors/:name/retry  ADMIN のみ
 */

import { Controller, Get, Post, Param, UseGuards, HttpCode } from '@nestjs/common';
import { ConnectorsService } from './connectors.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard }        from '../../common/guards/roles.guard';
import { Roles }             from '../../common/decorators/roles.decorator';

@Controller('connectors')
@UseGuards(JwtAuthGuard)
export class ConnectorsController {
  constructor(private readonly connectors: ConnectorsService) {}

  @Get('status')
  async getStatus() {
    return this.connectors.getStatus();
  }

  @Post(':name/retry')
  @Roles('ADMIN')
  @UseGuards(RolesGuard)
  @HttpCode(200)
  async retry(@Param('name') name: string) {
    // v5.1: ステータス再取得のみ（実際の再接続は各 Provider に委譲）
    const status = await this.connectors.getStatus();
    const target = status.connectors.find((c) => c.name === name);
    return { name, status: target?.status ?? 'unknown', retried: true };
  }
}