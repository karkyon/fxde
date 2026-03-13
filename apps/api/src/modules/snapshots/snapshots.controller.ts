/**
 * apps/api/src/modules/snapshots/snapshots.controller.ts
 *
 * 変更内容（round8）:
 *   [Task1] POST /api/v1/snapshots/capture を追加
 *           DTO: CaptureSnapshotBodyDto（packages/types の Zod Schema から派生）
 *           認証: JwtAuthGuard / @CurrentUser() user.sub
 *           レスポンス: 201 Created
 *
 * 参照仕様: SPEC_v51_part3 §7「Snapshots API」
 */

import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { SnapshotsService } from './snapshots.service';
import {
  CaptureSnapshotBodyDto,
  GetSnapshotsQueryDto,
  GetSnapshotsLatestQueryDto,
} from './dto/snapshots.dto';
import { JwtAuthGuard }            from '../../common/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';

@ApiTags('snapshots')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('snapshots')
export class SnapshotsController {
  constructor(private readonly snapshotsService: SnapshotsService) {}

  /**
   * POST /api/v1/snapshots/capture
   * スコア計算 + スナップショット保存。
   * 参照: SPEC_v51_part3 §7
   */
  @Post('capture')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'スコア計算 + スナップショット保存' })
  capture(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CaptureSnapshotBodyDto,
  ) {
    return this.snapshotsService.capture(user.sub, dto);
  }

  /**
   * GET /api/v1/snapshots/latest
   * NestJS ルート順解決: :id より先に定義すること。
   */
  @Get('latest')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '最新スナップショット取得' })
  getLatest(
    @CurrentUser() user: JwtPayload,
    @Query() query: GetSnapshotsLatestQueryDto,
  ) {
    return this.snapshotsService.getLatest(user.sub, query);
  }

  /**
   * GET /api/v1/snapshots
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'スナップショット一覧（ページネーション）' })
  getList(
    @CurrentUser() user: JwtPayload,
    @Query() query: GetSnapshotsQueryDto,
  ) {
    return this.snapshotsService.getList(user.sub, query);
  }
}