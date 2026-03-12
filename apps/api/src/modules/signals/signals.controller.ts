// apps/api/src/modules/signals/signals.controller.ts
import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SignalsService }              from './signals.service';
import { GetSignalsQueryDto, GetLatestSignalQueryDto } from './dto/signals.dto';
import { JwtAuthGuard }               from '../../common/guards/jwt-auth.guard';
import { CurrentUser }                from '../../common/decorators/current-user.decorator';
import type { JwtPayload }            from '../../common/decorators/current-user.decorator';

@Controller('signals')
@UseGuards(JwtAuthGuard)
export class SignalsController {
  constructor(private readonly signalsService: SignalsService) {}

  /**
   * GET /api/v1/signals
   * Signals 一覧取得（pagination）
   * 参照: SPEC_v51_part3 §9
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query() query: GetSignalsQueryDto,
  ) {
    return this.signalsService.findAll(user.sub, query);
  }

  /**
   * GET /api/v1/signals/latest
   * 最新 Signal 取得（データ無し → 404）
   * 参照: SPEC_v51_part3 §9
   *
   * ⚠️ NestJS のルーティング競合回避のため :id より前に定義すること
   */
  @Get('latest')
  @HttpCode(HttpStatus.OK)
  findLatest(
    @CurrentUser() user: JwtPayload,
    @Query() query: GetLatestSignalQueryDto,
  ) {
    return this.signalsService.findLatest(user.sub, query);
  }

  /**
   * POST /api/v1/signals/:id/ack
   * シグナル確認済み登録（acknowledgedAt を現在時刻にセット）
   * 参照: SPEC_v51_part3 §9 — POST メソッド確定
   */
  @Post(':id/ack')            // ← @Patch → @Post
  @HttpCode(HttpStatus.OK)
  acknowledge(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.signalsService.acknowledge(user.sub, id);
  }
}