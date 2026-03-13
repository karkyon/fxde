/**
 * apps/api/src/modules/symbols/symbols.service.ts
 *
 * 変更内容（round8-reaudit2）:
 *   [Task3] getCorrelation() を追加
 *           GET /api/v1/symbols/correlation?period=30d|90d
 *           権限: PRO | PRO_PLUS | ADMIN（controller 側 RolesGuard で制御）
 *           v5.1: スタブ固定値を返す（Redis キャッシュ実装は v6 対象）
 *
 * 参照仕様: SPEC_v51_part3 §6「Symbols API」§11「集計 API」
 *           SPEC_v51_part7 §2.4「通貨相関マトリクス（ProOnly）」
 *           SPEC_v51_part10 §6.8「集計・統計系」
 *           packages/types/src/index.ts SymbolWithSettingDto / CorrelationMatrix
 *           prisma/schema.prisma SymbolSetting モデル
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SYMBOLS } from './symbols.constants';
import type {
  SymbolWithSettingDto,
  UpdateSymbolSettingDto,
  CorrelationMatrix,
} from '@fxde/types';
import type { CorrelationQuery } from '@fxde/types';

// ── v5.1 スタブ: 相関マトリクス固定値 ────────────────────────────────────────
// 実際の相関係数は過去 N 日間の終値差分から Pearson 相関係数を計算する（v6 実装）
// v5.1 では代表的な相関値をスタブとして返す
const STUB_SYMBOLS = [
  'EURUSD', 'USDJPY', 'GBPUSD', 'USDCHF',
  'AUDUSD', 'NZDUSD', 'USDCAD', 'XAUUSD',
];

// 代表的な通貨ペア相関係数（スタブ固定値）
// 正の値 = 正の相関（同方向に動く）/ 負の値 = 逆相関（逆方向に動く）
const STUB_MATRIX: number[][] = [
  // EUR    JPY    GBP    CHF    AUD    NZD    CAD    XAU
  [ 1.00,  -0.72,  0.88,  0.65,  0.71,  0.65, -0.58,  0.52], // EURUSD
  [-0.72,   1.00, -0.61, -0.80, -0.58, -0.52,  0.72, -0.42], // USDJPY
  [ 0.88,  -0.61,  1.00,  0.58,  0.64,  0.58, -0.51,  0.48], // GBPUSD
  [ 0.65,  -0.80,  0.58,  1.00,  0.52,  0.48, -0.65,  0.38], // USDCHF
  [ 0.71,  -0.58,  0.64,  0.52,  1.00,  0.91, -0.42,  0.62], // AUDUSD
  [ 0.65,  -0.52,  0.58,  0.48,  0.91,  1.00, -0.38,  0.58], // NZDUSD
  [-0.58,   0.72, -0.51, -0.65, -0.42, -0.38,  1.00, -0.32], // USDCAD
  [ 0.52,  -0.42,  0.48,  0.38,  0.62,  0.58, -0.32,  1.00], // XAUUSD
];

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
    const settings = await this.prisma.symbolSetting.findMany({
      where: { userId },
    });

    const settingMap = new Map(settings.map((s) => [s.symbol, s]));

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
   * GET /api/v1/symbols/correlation?period=30d|90d
   * 通貨ペア相関マトリクスを返す。
   * 権限チェックは controller 側 RolesGuard（PRO | PRO_PLUS | ADMIN）で実施済み。
   * v5.1: スタブ固定値を返す。Redis キャッシュ / 実計算は v6 対象。
   * 参照: SPEC_v51_part3 §11 / SPEC_v51_part7 §2.4 / SPEC_v51_part10 §6.8
   */
  async getCorrelation(_userId: string, query: CorrelationQuery): Promise<CorrelationMatrix> {
    return {
      symbols:  STUB_SYMBOLS,
      matrix:   STUB_MATRIX,
      period:   query.period,
      cachedAt: new Date().toISOString(), // v5.1 スタブでは常に現在時刻
    };
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
    const isValidSymbol = SYMBOLS.some((s) => s.symbol === symbol);
    if (!isValidSymbol) {
      throw new NotFoundException(`Symbol "${symbol}" is not supported`);
    }

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
        ...(dto.customThreshold  !== undefined && { customThreshold: dto.customThreshold }),
      },
    });

    return updated;
  }
}