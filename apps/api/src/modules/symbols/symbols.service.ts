/**
 * apps/api/src/modules/symbols/symbols.service.ts
 *
 * 変更内容（round8-reaudit）:
 *   [P1] findAll() を async に変更し、userId を受け取るように修正
 *        GET /api/v1/symbols レスポンスを
 *        「システム定義 + ユーザー個別設定マージ」形式（SymbolWithSettingDto）に変更
 *        SymbolSetting が未作成のペアは既定値（enabled: true, defaultTimeframe: 'H4', customThreshold: null）で補完
 *
 * 参照仕様: SPEC_v51_part3 §6「Symbols API」
 *           packages/types/src/index.ts SymbolWithSettingDto
 *           prisma/schema.prisma SymbolSetting モデル
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SYMBOLS } from './symbols.constants';
import type { SymbolWithSettingDto, UpdateSymbolSettingDto } from '@fxde/types';

@Injectable()
export class SymbolsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * GET /api/v1/symbols
   * システム定義通貨ペア + ユーザー個別設定を merge した一覧を返す。
   * SymbolSetting が存在しないペアは既定値で補完する。
   * 参照: SPEC_v51_part3 §6
   */
  async findAll(userId: string): Promise<SymbolWithSettingDto[]> {
    // ユーザーの全 SymbolSetting を一括取得
    const settings = await this.prisma.symbolSetting.findMany({
      where: { userId },
    });

    // symbol → SymbolSetting のマップを作成
    const settingMap = new Map(settings.map((s) => [s.symbol, s]));

    // システム定義ペアとマージ
    return SYMBOLS.map((def) => {
      const setting = settingMap.get(def.symbol);
      return {
        symbol:           def.symbol,
        pipSize:          def.pipSize,
        enabled:          setting?.enabled          ?? true,
        defaultTimeframe: (setting?.defaultTimeframe as any) ?? 'H4',
        customThreshold:  setting?.customThreshold  ?? null,
      };
    });
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
      where:  { userId_symbol: { userId, symbol } },
      create: {
        userId,
        symbol,
        enabled:          dto.enabled          ?? true,
        defaultTimeframe: (dto.defaultTimeframe as any) ?? 'H4',
        customThreshold:  dto.customThreshold  ?? null,
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