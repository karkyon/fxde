/**
 * apps/api/src/modules/symbols/dto/symbols.dto.ts
 *
 * 参照仕様: SPEC_v51_part3 §6「Symbols API」
 *           packages/types/src/schemas/symbol.schema.ts（正本）
 */
import { createZodDto } from 'nestjs-zod';
import { UpdateSymbolSettingSchema } from '@fxde/types';

/**
 * PATCH /api/v1/symbols/:symbol リクエスト DTO
 */
export class UpdateSymbolSettingBodyDto extends createZodDto(UpdateSymbolSettingSchema) {}