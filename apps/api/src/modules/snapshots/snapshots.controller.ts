/**
 * apps/api/src/modules/snapshots/snapshots.controller.ts
 *
 * 変更内容（round8-reaudit）:
 *   [P1] GET /api/v1/snapshots/:id を追加（認証ユーザー本人のみ取得可能）
 *   [P1] POST /api/v1/snapshots/evaluate を追加（保存なし評価のみ）
 *
 * NestJS ルート順序の注意:
 *   static route（'capture', 'evaluate', 'latest', ''）を ':id' より必ず前に定義する。
 *   ':id' が先にあると NestJS が "capture" / "evaluate" を UUID として解釈し 400 になる。
 *
 * 参照仕様: SPEC_v51_part3 §7「Snapshots API」
 */

import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiOkResponse,
  ApiCreatedResponse,
} from '@nestjs/swagger';
import { SnapshotsService } from './snapshots.service';
import {
  CaptureSnapshotBodyDto,
  EvaluateSnapshotBodyDto,
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

  // ────────────────────────────────────────────────────────────────────────
  // POST（static routes を先に定義）
  // ────────────────────────────────────────────────────────────────────────

  /**
   * POST /api/v1/snapshots/capture
   * スコア計算 + スナップショット保存。
   * 参照: SPEC_v51_part3 §7
   */
  @Post('capture')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'スコア計算 + スナップショット保存' })
  @ApiCreatedResponse({ description: 'SnapshotResponse' })
  capture(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CaptureSnapshotBodyDto,
  ) {
    return this.snapshotsService.capture(user.sub, dto);
  }

  /**
   * POST /api/v1/snapshots/evaluate
   * 保存なしのスコア評価のみ。capture と同一 response shape を返す。
   * 参照: SPEC_v51_part3 §7
   */
  @Post('evaluate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'スコア評価のみ（DB 保存なし）' })
  @ApiOkResponse({ description: 'SnapshotResponse（DB 保存なし）' })
  evaluate(
    @CurrentUser() user: JwtPayload,
    @Body() dto: EvaluateSnapshotBodyDto,
  ) {
    return this.snapshotsService.evaluate(user.sub, dto);
  }

  // ────────────────────────────────────────────────────────────────────────
  // GET（static routes を ':id' より先に定義）
  // ────────────────────────────────────────────────────────────────────────

  /**
   * GET /api/v1/snapshots/latest
   * NestJS ルート順解決: ':id' より先に定義すること。
   */
  @Get('latest')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '最新スナップショット取得' })
  @ApiOkResponse({ description: 'SnapshotResponse | null' })
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
  @ApiOkResponse({ description: 'PaginatedResponse<SnapshotResponse>' })
  getList(
    @CurrentUser() user: JwtPayload,
    @Query() query: GetSnapshotsQueryDto,
  ) {
    return this.snapshotsService.getList(user.sub, query);
  }

  /**
   * GET /api/v1/snapshots/:id
   * 認証ユーザー本人の snapshot のみ取得可能。
   * 他人のデータは 403 Forbidden を返す。
   * 参照: SPEC_v51_part3 §7
   */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'スナップショット詳細取得' })
  @ApiParam({ name: 'id', description: 'Snapshot UUID' })
  @ApiOkResponse({ description: 'SnapshotResponse' })
  getById(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.snapshotsService.getById(user.sub, id);
  }
}