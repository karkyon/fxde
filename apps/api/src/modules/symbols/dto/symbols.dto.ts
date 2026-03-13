/**
 * apps/api/src/modules/symbols/dto/symbols.dto.ts
 *
 * 変更内容（round8-reaudit2）:
 *   [Task3] CorrelationQueryDto を追加
 *           GET /api/v1/symbols/correlation クエリ DTO
 *
 * 参照仕様: SPEC_v51_part3 §6「Symbols API」§11「集計 API」
 *           packages/types/src/schemas/symbol.schema.ts（正本）
 */
import { createZodDto } from 'nestjs-zod';
import { UpdateSymbolSettingSchema, CorrelationQuerySchema } from '@fxde/types';

/**
 * PATCH /api/v1/symbols/:symbol リクエスト DTO
 */
export class UpdateSymbolSettingBodyDto extends createZodDto(UpdateSymbolSettingSchema) {}

/**
 * GET /api/v1/symbols/correlation クエリ DTO
 * period: '30d' | '90d'（省略時は '30d'）
 * 権限: PRO | PRO_PLUS | ADMIN
 */
export class CorrelationQueryDto extends createZodDto(CorrelationQuerySchema) {}