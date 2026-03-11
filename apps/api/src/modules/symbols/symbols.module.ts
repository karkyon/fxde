// apps/api/src/modules/symbols/symbols.module.ts

import { Module } from '@nestjs/common';
import { SymbolsController } from './symbols.controller';
import { SymbolsService } from './symbols.service';

@Module({
  controllers: [SymbolsController],
  providers:   [SymbolsService],
  exports:     [SymbolsService], // 他モジュールから参照できるようにエクスポート
})
export class SymbolsModule {}