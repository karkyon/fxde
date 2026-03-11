// apps/api/src/modules/symbols/symbols.service.ts

import { Injectable } from '@nestjs/common';
import { SYMBOLS, SymbolDefinition } from './symbols.constants';

@Injectable()
export class SymbolsService {
  findAll(): SymbolDefinition[] {
    return SYMBOLS;
  }
}