/**
 * apps/api/src/modules/trades/trades.controller.ts
 *
 * 変更内容（round8）:
 *   [Task3] GET /api/v1/trades/equity-curve を追加
 *           GET /api/v1/trades/stats/summary を追加
 *   ⚠️ NestJS ルート解決順序に注意:
 *      static path (equity-curve / stats/summary) は :id より先に定義する。
 *
 * 参照仕様: SPEC_v51_part3 §11「集計 API」
 *           SPEC_v51_part10 §6.8
 */

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
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
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard }            from '../../common/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { TradesService }           from './trades.service';
import {
  CreateTradeDto,
  UpdateTradeDto,
  CloseTradeDto,
  GetTradesQueryDto,
  CreateTradeReviewDto,
} from './dto/trades.dto';

@ApiTags('trades')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('trades')
export class TradesController {
  constructor(private readonly tradesService: TradesService) {}

  /** POST /api/v1/trades */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'トレード作成' })
  create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateTradeDto,
  ) {
    return this.tradesService.create(user.sub, dto);
  }

  /** GET /api/v1/trades */
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'トレード一覧（フィルター・ページネーション）' })
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query() query: GetTradesQueryDto,
  ) {
    return this.tradesService.findAll(user.sub, query);
  }

  /**
   * GET /api/v1/trades/equity-curve?period=1M|3M|1Y
   * ⚠️ static route → :id より前に定義すること（NestJS ルート解決順序）
   * 参照: SPEC_v51_part3 §11
   */
  @Get('equity-curve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '損益曲線（period=1M|3M|1Y）' })
  @ApiQuery({ name: 'period', enum: ['1M', '3M', '1Y'], required: false })
  getEquityCurve(
    @CurrentUser() user: JwtPayload,
    @Query('period') period?: string,
  ) {
    const validPeriod =
      period === '3M' || period === '1Y' ? period : '1M';
    return this.tradesService.getEquityCurve(user.sub, validPeriod);
  }

  /**
   * GET /api/v1/trades/stats/summary
   * ⚠️ static route → :id より前に定義すること
   * 参照: SPEC_v51_part3 §11
   */
  @Get('stats/summary')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '月次サマリー（勝率・損益・DD・規律遵守率）' })
  getStatsSummary(@CurrentUser() user: JwtPayload) {
    return this.tradesService.getStatsSummary(user.sub);
  }

  /** GET /api/v1/trades/:id */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'トレード詳細' })
  @ApiParam({ name: 'id', format: 'uuid' })
  findOne(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.tradesService.findOne(user.sub, id);
  }

  /** PATCH /api/v1/trades/:id */
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'トレード部分更新（sl / tp / tags / note）' })
  @ApiParam({ name: 'id', format: 'uuid' })
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTradeDto,
  ) {
    return this.tradesService.update(user.sub, id, dto);
  }

  /** POST /api/v1/trades/:id/close */
  @Post(':id/close')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'トレードクローズ（exitTime / exitPrice / pnl 確定）' })
  @ApiParam({ name: 'id', format: 'uuid' })
  close(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CloseTradeDto,
  ) {
    return this.tradesService.close(user.sub, id, dto);
  }

  /** DELETE /api/v1/trades/:id → 論理削除（status=CANCELED）*/
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'トレード論理削除（status=CANCELED）' })
  @ApiParam({ name: 'id', format: 'uuid' })
  cancel(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.tradesService.cancel(user.sub, id);
  }

  /** POST /api/v1/trades/:id/review */
  @Post(':id/review')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '振り返り登録' })
  @ApiParam({ name: 'id', format: 'uuid' })
  createReview(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateTradeReviewDto,
  ) {
    return this.tradesService.createReview(user.sub, id, dto);
  }

  /** GET /api/v1/trades/:id/review */
  @Get(':id/review')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '振り返り取得' })
  @ApiParam({ name: 'id', format: 'uuid' })
  getReview(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.tradesService.getReview(user.sub, id);
  }
}