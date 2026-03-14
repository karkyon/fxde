/**
 * apps/api/src/plugins-runtime/dto/get-chart-plugin-runtime.query.dto.ts
 *
 * GET /api/v1/plugins-runtime/chart クエリパラメータ DTO
 *
 * 参照仕様:
 *   fxde_plugin_runtime_完全設計書 §7.2「Query」
 *   SPEC_v51_part4 §4「DTO 規約 — createZodDto() 必須」
 *
 * ⚠️ class-validator 手書き禁止。createZodDto() のみ使用。
 */

import { createZodDto } from 'nestjs-zod';
import { GetChartPluginRuntimeQuerySchema } from '@fxde/types';

export class GetChartPluginRuntimeQueryDto extends createZodDto(
  GetChartPluginRuntimeQuerySchema,
) {}