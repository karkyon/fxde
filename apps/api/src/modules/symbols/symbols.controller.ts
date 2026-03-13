/**
 * apps/api/src/modules/symbols/symbols.controller.ts
 *
 * 役割: Symbols API コントローラ
 *
 * エンドポイント:
 *   GET   /api/v1/symbols              → 全ロール（システム定義 + ユーザー設定マージ一覧）
 *   GET   /api/v1/symbols/correlation  → PRO | PRO_PLUS | ADMIN のみ（相関マトリクス）
 *   PATCH /api/v1/symbols/:symbol      → 全ロール（個別設定更新）
 *
 * 注意: NestJS ルート順
 *   GET /correlation は GET /:symbol より前に定義する（static route 優先）
 *
 * 参照仕様:
 *   SPEC_v51_part3 §6「Symbols API」§11「集計 API」
 *   SPEC_v51_part7 §2.4「通貨相関マトリクス（ProOnly）」
 *   SPEC_v51_part10 §6.8「集計・統計系」
 */

import {
  Controller,
  Get,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiOkResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard }            from '../../common/guards/jwt-auth.guard';
import { RolesGuard }              from '../../common/guards/roles.guard';
import { Roles }                   from '../../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { SymbolsService }          from './symbols.service';
import { UpdateSymbolSettingBodyDto, CorrelationQueryDto } from './dto/symbols.dto';

@ApiTags('symbols')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('symbols')
export class SymbolsController {
  constructor(private readonly symbolsService: SymbolsService) {}

  /**
   * GET /api/v1/symbols
   * システム定義通貨ペア + ユーザー個別設定のマージ一覧を返す。
   * SymbolSetting が未作成のペアは既定値で補完する。
   * 参照: SPEC_v51_part3 §6
   */
  @Get()
  @ApiOperation({ summary: 'ペア設定一覧（システム定義 + ユーザー設定のマージ）' })
  @ApiOkResponse({ description: 'SymbolWithSettingDto 配列' })
  findAll(@CurrentUser() user: JwtPayload) {
    return this.symbolsService.findAll(user.sub);
  }

  /**
   * GET /api/v1/symbols/correlation?period=30d|90d
   * 通貨ペア相関マトリクス（−1.0〜+1.0）
   * 権限: PRO | PRO_PLUS | ADMIN
   * Redis 1時間キャッシュ + v5.1 スタブ固定値
   * 参照: SPEC_v51_part3 §11 / SPEC_v51_part7 §2.4 / SPEC_v51_part10 §6.8
   */
  @Get('correlation')
  @HttpCode(HttpStatus.OK)
  @Roles('PRO', 'PRO_PLUS', 'ADMIN')
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: '通貨ペア相関マトリクス（PRO | PRO_PLUS | ADMIN）' })
  @ApiQuery({ name: 'period', enum: ['30d', '90d'], required: false, description: '集計期間（デフォルト: 30d）' })
  @ApiOkResponse({ description: 'CorrelationMatrix' })
  getCorrelation(
    @CurrentUser() user: JwtPayload,
    @Query() query: CorrelationQueryDto,
  ) {
    return this.symbolsService.getCorrelation(user.sub, query);
  }

  /**
   * PATCH /api/v1/symbols/:symbol
   * ユーザーの通貨ペア個別設定を部分更新する。
   * 参照: SPEC_v51_part3 §6
   */
  @Patch(':symbol')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'ペア個別設定の部分更新（enabled / defaultTimeframe / customThreshold）' })
  @ApiParam({ name: 'symbol', example: 'EURUSD' })
  @ApiOkResponse({ description: '更新後の SymbolSetting' })
  updateSymbolSetting(
    @CurrentUser() user: JwtPayload,
    @Param('symbol') symbol: string,
    @Body() dto: UpdateSymbolSettingBodyDto,
  ) {
    return this.symbolsService.updateSymbolSetting(user.sub, symbol, dto);
  }
}