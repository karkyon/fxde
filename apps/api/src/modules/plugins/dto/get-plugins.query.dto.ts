/**
 * apps/api/src/modules/plugins/dto/get-plugins.query.dto.ts
 *
 * 参照仕様: fxde_plugin_system_完全設計書 §3.1 フィルタ / ソート定義
 *           SPEC_v51_part4 §4.3（NestJS guard / DTO 規約）
 */

import { IsIn, IsOptional, IsString } from 'class-validator';

const FILTER_VALUES = [
  'all',
  'enabled',
  'disabled',
  'pattern',
  'indicator',
  'strategy',
  'ai',
  'overlay',
  'risk',
] as const;

const SORT_VALUES = [
  'name',
  'updatedAt',
  'installedAt',
  'enabled',
  'recommended',
] as const;

export type PluginFilter = (typeof FILTER_VALUES)[number];
export type PluginSort   = (typeof SORT_VALUES)[number];

export class GetPluginsQueryDto {
  @IsOptional()
  @IsString()
  @IsIn(FILTER_VALUES)
  filter?: PluginFilter = 'all';

  @IsOptional()
  @IsString()
  @IsIn(SORT_VALUES)
  sort?: PluginSort = 'name';
}