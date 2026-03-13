/**
 * apps/api/src/modules/symbols/symbols.controller.ts
 *
 * 変更内容（round8）:
 *   [Task2] PATCH /api/v1/symbols/:symbol を追加
 *           DTO: UpdateSymbolSettingBodyDto（packages/types の Zod Schema から派生）
 *           認証: JwtAuthGuard / @CurrentUser() user.sub
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
  ApiCreatedResponse,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard }            from '../../common/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { SymbolsService }          from './symbols.service';
import { SymbolDefinition }        from './symbols.constants';
import { UpdateSymbolSettingBodyDto } from './dto/symbols.dto';

@ApiTags('symbols')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('symbols')
export class SymbolsController {
  constructor(private readonly symbolsService: SymbolsService) {}

  /**
   * GET /api/v1/symbols
   * システム定義の通貨ペア一覧を返す。
   */
  @Get()
  @ApiOperation({ summary: 'サポートされている FX 通貨ペア一覧を返す（システム定義・固定）' })
  @ApiOkResponse({ description: '通貨ペア配列' })
  findAll(): SymbolDefinition[] {
    return this.symbolsService.findAll();
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