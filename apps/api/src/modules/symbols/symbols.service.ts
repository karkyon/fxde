/**
 * apps/api/src/modules/symbols/symbols.service.ts
 *
 * 変更内容（round8）:
 *   [Task2] updateSymbolSetting() を追加
 *           PATCH /api/v1/symbols/:symbol 処理
 *           SymbolSetting が存在しない場合は upsert で作成する
 *           customThreshold: null の場合は UserSetting の値に戻す仕様（SPEC_v51_part3 §6）
 *
 * 参照仕様: SPEC_v51_part3 §6「Symbols API」
 *           prisma/schema.prisma SymbolSetting モデル
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SYMBOLS, SymbolDefinition } from './symbols.constants';
import type { UpdateSymbolSettingDto } from '@fxde/types';

@Injectable()
export class SymbolsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * GET /api/v1/symbols
   * システム定義の通貨ペア一覧を返す。
   */
  findAll(): SymbolDefinition[] {
    return SYMBOLS;
  }

  /**
   * PATCH /api/v1/symbols/:symbol
   * ユーザーのシンボル個別設定を部分更新する。
   * SymbolSetting が存在しない場合は新規作成（upsert）。
   * 参照: SPEC_v51_part3 §6
   */
  async updateSymbolSetting(
    userId: string,
    symbol: string,
    dto: UpdateSymbolSettingDto,
  ) {
    // システム定義済みシンボルであることを確認
    const isValidSymbol = SYMBOLS.some((s) => s.symbol === symbol);
    if (!isValidSymbol) {
      throw new NotFoundException(`Symbol "${symbol}" is not supported`);
    }

    // upsert: 存在しなければ作成、存在すれば更新
    const updated = await this.prisma.symbolSetting.upsert({
      where: { userId_symbol: { userId, symbol } },
      create: {
        userId,
        symbol,
        enabled:          dto.enabled          ?? true,
        defaultTimeframe: (dto.defaultTimeframe as any) ?? 'H4',
        customThreshold:  dto.customThreshold   ?? null,
      },
      update: {
        ...(dto.enabled          !== undefined && { enabled: dto.enabled }),
        ...(dto.defaultTimeframe !== undefined && { defaultTimeframe: dto.defaultTimeframe as any }),
        // customThreshold: null は明示的に null をセット（UserSetting 閾値に戻す仕様）
        ...(dto.customThreshold  !== undefined && { customThreshold: dto.customThreshold }),
      },
    });

    return updated;
  }
}