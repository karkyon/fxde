/**
 * apps/api/src/modules/plugins/dto/plugin-id.param.dto.ts
 *
 * 参照仕様: 既存 DTO 命名規約（SPEC_v51_part3 §2）
 */

import { IsString, IsNotEmpty } from 'class-validator';

export class PluginIdParamDto {
  @IsString()
  @IsNotEmpty()
  pluginId!: string;
}