// apps/api/src/modules/trades/trades.controller.ts
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
} from '@nestjs/swagger';
import { JwtAuthGuard }                from '../../common/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload }     from '../../common/decorators/current-user.decorator';
import { TradesService }               from './trades.service';
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

  /** DELETE /api/v1/trades/:id  → 論理削除（status=CANCELED） */
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
  @ApiOperation({ summary: '振り返り登録（1 トレードに 1 件のみ）' })
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