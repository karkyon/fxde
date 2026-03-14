/**
 * apps/api/src/modules/plugins/dto/get-plugins.dto.ts
 *
 * 修正1: class-validator DTO を Zod DTO へ置換
 *
 * 参照仕様:
 *   SPEC_v51_part1「Zod / DTO 主従ルール」
 *   packages/types/src/schemas/plugin.schema.ts（正本）
 *
 * ⚠️ このファイルは packages/types の Schema を唯一の正本とする。
 *    @IsString() 等 class-validator デコレータの手書きは絶対禁止。
 */

import { createZodDto }         from 'nestjs-zod';
import { GetPluginsQuerySchema } from '@fxde/types';

/**
 * GET /api/v1/plugins クエリ DTO
 * filter / sort を型安全に受け取る。
 */
export class GetPluginsQueryDto extends createZodDto(GetPluginsQuerySchema) {}