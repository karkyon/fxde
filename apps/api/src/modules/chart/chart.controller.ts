/**
 * apps/api/src/chart/chart.controller.ts
 *
 * Chart API コントローラー
 *
 * 参照仕様:
 *   SPEC_v51_part11 §2.2「エンドポイント一覧」
 *   SPEC_v51_part11 §10.2「RolesGuard 適用方針」
 *   SPEC_v51_part1 §0-17「API バージョン規則: /api/v1/chart/*」
 *
 * エンドポイント:
 *   GET /api/v1/chart/meta                 全ロール
 *   GET /api/v1/chart/candles              全ロール
 *   GET /api/v1/chart/indicators           全ロール
 *   GET /api/v1/chart/trades               全ロール
 *   GET /api/v1/chart/pattern-markers      全ロール（ロール別フィルタはサービス層）
 *   GET /api/v1/chart/prediction-overlay   PRO | PRO_PLUS | ADMIN のみ
 *
 * 注意: /api/chart/* は禁止。必ず /api/v1/chart/* を使用。
 */

import {
  Controller,
  Get,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ChartService }    from './chart.service';
import { ChartMetaQueryDto }              from './dto/chart-meta.query.dto';
import { ChartCandlesQueryDto }           from './dto/chart-candles.query.dto';
import { ChartIndicatorsQueryDto }        from './dto/chart-indicators.query.dto';
import { ChartTradesQueryDto }            from './dto/chart-trades.query.dto';
import { ChartPatternMarkersQueryDto }    from './dto/chart-pattern-markers.query.dto';
import { ChartPredictionOverlayQueryDto } from './dto/chart-prediction-overlay.query.dto';
import { JwtAuthGuard }    from '../../common/guards/jwt-auth.guard';
import { RolesGuard }      from '../../common/guards/roles.guard';
import { Roles }           from '../../common/decorators/roles.decorator';
import { CurrentUser }     from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../common/decorators/current-user.decorator';
import type { UserRole }   from '@fxde/types';

@Controller('chart')
@UseGuards(JwtAuthGuard)    // 全エンドポイントで AT 必須
export class ChartController {
  constructor(private readonly chartService: ChartService) {}

  /** GET /api/v1/chart/meta — 全ロール */
  @Get('meta')
  @HttpCode(HttpStatus.OK)
  getMeta(@Query() query: ChartMetaQueryDto) {
    return this.chartService.getMeta(query);
  }

  /** GET /api/v1/chart/candles — 全ロール */
  @Get('candles')
  @HttpCode(HttpStatus.OK)
  getCandles(@Query() query: ChartCandlesQueryDto) {
    return this.chartService.getCandles(query);
  }

  /** GET /api/v1/chart/indicators — 全ロール */
  @Get('indicators')
  @HttpCode(HttpStatus.OK)
  getIndicators(@Query() query: ChartIndicatorsQueryDto) {
    return this.chartService.getIndicators(query);
  }

  /** GET /api/v1/chart/trades — 全ロール */
  @Get('trades')
  @HttpCode(HttpStatus.OK)
  getTrades(
    @CurrentUser() user: JwtPayload,
    @Query() query: ChartTradesQueryDto,
  ) {
    return this.chartService.getTrades(user.sub, query);
  }

  /**
   * GET /api/v1/chart/pattern-markers — 全ロール
   * ロール別パターン種別フィルタはサービス層で実施（SPEC_v51_part11 §10.3）
   * フロント側フィルタ禁止（SPEC_v51_part1 §0-16）
   */
  @Get('pattern-markers')
  @HttpCode(HttpStatus.OK)
  getPatternMarkers(
    @CurrentUser() user: JwtPayload,
    @Query() query: ChartPatternMarkersQueryDto,
  ) {
    return this.chartService.getPatternMarkers(
      user.sub,
      user.role as UserRole,
      query,
    );
  }

  /**
   * GET /api/v1/chart/prediction-overlay — PRO | PRO_PLUS | ADMIN のみ
   * FREE | BASIC に対して RolesGuard が HTTP 403 を返す（二重保護）
   * 参照: SPEC_v51_part11 §3.6 / SPEC_v51_part10 §10.10
   */
  @Get('prediction-overlay')
  @HttpCode(HttpStatus.OK)
  @Roles('PRO', 'PRO_PLUS', 'ADMIN')
  @UseGuards(RolesGuard)
  getPredictionOverlay(@Query() query: ChartPredictionOverlayQueryDto) {
    return this.chartService.getPredictionOverlay(query);
  }
}