/**
 * apps/api/src/modules/snapshots/snapshots.controller.ts
 *
 * 変更理由:
 *   旧実装は @Request() req: { user: { id: string } } を使用。
 *   JWT payload の正本フィールドは 'sub'（id ではない）。
 *   @CurrentUser() デコレータを使う標準方式に統一する。
 *
 * 参照仕様: SPEC_v51_part3 §1「API 設計方針」
 *           監査レポート A-3「Snapshots の user 取得方法に不整合の可能性」
 *           監査レポート 最優先4「req.user.id / sub など認証ユーザー取得方法を統一」
 */

import {
  Controller,
  Get,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { SnapshotsService }               from './snapshots.service';
import { GetSnapshotsQueryDto, GetSnapshotsLatestQueryDto } from './dto/snapshots.dto';
import { JwtAuthGuard }                   from '../../common/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload }        from '../../common/decorators/current-user.decorator';

@ApiTags('snapshots')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('snapshots')
export class SnapshotsController {
  constructor(private readonly snapshotsService: SnapshotsService) {}

  /**
   * GET /api/v1/snapshots/latest
   * NestJS ルート順解決: :id より先に定義すること。
   */
  @Get('latest')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '最新スナップショット取得' })
  getLatest(
    @CurrentUser() user: JwtPayload,   // ← req.user.id → user.sub に修正
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