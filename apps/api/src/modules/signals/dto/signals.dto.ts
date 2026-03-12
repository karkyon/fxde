/**
 * apps/api/src/modules/signals/dto/signals.dto.ts
 *
 * 変更理由:
 *   旧実装は class-validator (@IsOptional, @IsString 等) を使用。
 *   仕様では全 DTO は Zod Schema から派生させること（SPEC_v51_part3 §1 DTO 実装規則）。
 *
 * 参照仕様: SPEC_v51_part3 §9「Signals API」
 *           SPEC_v51_part1「Zod / DTO 主従ルール」
 *           監査レポート C-1「class-validator と nestjs-zod が混在」
 */

import { createZodDto } from 'nestjs-zod';
import { GetSignalsQuerySchema, GetSignalsLatestQuerySchema } from '@fxde/types';

export class GetSignalsQueryDto       extends createZodDto(GetSignalsQuerySchema) {}
export class GetLatestSignalQueryDto  extends createZodDto(GetSignalsLatestQuerySchema) {}