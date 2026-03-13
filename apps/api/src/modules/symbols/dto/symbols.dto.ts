/**
 * apps/api/src/modules/symbols/dto/symbols.dto.ts
 *
 * 役割: Symbols API の NestJS DTO 定義
 *   - PATCH /api/v1/symbols/:symbol  → UpdateSymbolSettingBodyDto
 *   - GET /api/v1/symbols/correlation → CorrelationQueryDto
 *
 * 参照仕様:
 *   SPEC_v51_part3 §6「Symbols API」§11「集計 API」
 *   packages/types/src/schemas/symbol.schema.ts（正本）
 */
import { createZodDto } from 'nestjs-zod';
import { UpdateSymbolSettingSchema, CorrelationQuerySchema } from '@fxde/types';

/**
 * PATCH /api/v1/symbols/:symbol リクエスト DTO
 * enabled / defaultTimeframe / customThreshold を部分更新する。
 */
export class UpdateSymbolSettingBodyDto extends createZodDto(UpdateSymbolSettingSchema) {}

/**
 * GET /api/v1/symbols/correlation クエリ DTO
 * period: '30d' | '90d'（省略時は '30d'）
 * 権限: PRO | PRO_PLUS | ADMIN
 */
export class CorrelationQueryDto extends createZodDto(CorrelationQuerySchema) {}