/**
 * apps/api/src/ai-summary/ai-summary.controller.ts
 *
 * 参照仕様: SPEC_v51_part3 §14「AI Summary API」
 *           SPEC_v51_part10 §6.7「AI 要約系エンドポイント」
 *
 * エンドポイント:
 *   POST /api/v1/ai-summary        → AI 要約生成（BASIC | PRO | PRO_PLUS | ADMIN）
 *   GET  /api/v1/ai-summary/latest → 最新 AI 要約取得（BASIC | PRO | PRO_PLUS | ADMIN）
 */

import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { JwtAuthGuard }              from '../common/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload }   from '../common/decorators/current-user.decorator';
import { AiSummaryService }          from './ai-summary.service';
import type { UserRole } from '@fxde/types';

// ── DTO ──────────────────────────────────────────────────────────────────────
const CreateAiSummarySchema = z.object({
  symbol:     z.string().min(1),
  timeframe:  z.enum(['M1','M5','M15','M30','H1','H4','H8','D1','W1','MN']),
  snapshotId: z.string().uuid().optional(),
});
class CreateAiSummaryDto extends createZodDto(CreateAiSummarySchema) {}

const GetLatestAiSummarySchema = z.object({
  symbol:    z.string().min(1),
  timeframe: z.enum(['M1','M5','M15','M30','H1','H4','H8','D1','W1','MN']),
});
class GetLatestAiSummaryDto extends createZodDto(GetLatestAiSummarySchema) {}

// ── Controller ───────────────────────────────────────────────────────────────
@ApiTags('ai-summary')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('ai-summary')
export class AiSummaryController {
  constructor(private readonly aiSummaryService: AiSummaryService) {}

  /**
   * POST /api/v1/ai-summary
   * AI マーケットサマリー生成
   * 権限: BASIC | PRO | PRO_PLUS | ADMIN
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'AI マーケットサマリー生成' })
  generate(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateAiSummaryDto,
  ) {
    return this.aiSummaryService.generateAndSave(
      user.sub,
      user.role as UserRole,
      dto.symbol,
      dto.timeframe,
      dto.snapshotId,
    );
  }

  /**
   * GET /api/v1/ai-summary/latest
   * 最新 AI サマリー取得
   * 権限: BASIC | PRO | PRO_PLUS | ADMIN
   */
  @Get('latest')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '最新 AI サマリー取得' })
  getLatest(
    @CurrentUser() user: JwtPayload,
    @Query() query: GetLatestAiSummaryDto,
  ) {
    return this.aiSummaryService.getLatest(
      user.sub,
      query.symbol,
      query.timeframe,
    );
  }
}