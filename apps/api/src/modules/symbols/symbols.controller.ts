// apps/api/src/modules/symbols/symbols.controller.ts

import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiOkResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { SymbolsService } from './symbols.service';
import { SymbolDefinition } from './symbols.constants';

@ApiTags('symbols')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('symbols')
export class SymbolsController {
  constructor(private readonly symbolsService: SymbolsService) {}

  @Get()
  @ApiOperation({ summary: 'サポートされている FX 通貨ペア一覧を返す（システム定義・固定）' })
  @ApiOkResponse({ description: '通貨ペア配列' })
  findAll(): SymbolDefinition[] {
    return this.symbolsService.findAll();
  }
}