/**
 * apps/api/src/modules/plugins/dto/plugin-id.dto.ts
 *
 * 修正1: class-validator DTO を Zod DTO へ置換
 *
 * 参照仕様:
 *   SPEC_v51_part1「Zod / DTO 主従ルール」
 *   packages/types/src/schemas/plugin.schema.ts（正本）
 *
 * ⚠️ このファイルは packages/types の Schema を唯一の正本とする。
 */

import { createZodDto }        from 'nestjs-zod';
import { PluginIdParamSchema }  from '@fxde/types';

/**
 * プラグイン ID パスパラメータ DTO
 * :pluginId を型安全に受け取る。
 */
export class PluginIdParamDto extends createZodDto(PluginIdParamSchema) {}