/**
 * apps/api/src/modules/plugins-ranking/dto/get-plugin-ranking.query.dto.ts
 *
 * Zod 正本: packages/types/src/schemas/plugin-ranking.schema.ts
 * class-validator 手書き禁止。
 */

import { createZodDto }              from 'nestjs-zod';
import { GetPluginRankingQuerySchema } from '@fxde/types';

export class GetPluginRankingQueryDto extends createZodDto(GetPluginRankingQuerySchema) {}