/**
 * apps/api/src/modules/symbols/symbols.controller.ts
 *
 * 変更内容（round8-reaudit）:
 *   [P1] GET / の findAll() に user.sub を渡すよう修正
 *        レスポンスが SymbolWithSettingDto[] になりユーザー設定がマージされる
 *
 * 参照仕様: SPEC_v51_part3 §6「Symbols API」
 */

import {
  Controller,
  Get,
  Patch,
  Body,
  Param,
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
} from '@nestjs/swagger';
import { JwtAuthGuard }            from '../../common/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { SymbolsService }          from './symbols.service';
import { UpdateSymbolSettingBodyDto } from './dto/symbols.dto';

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