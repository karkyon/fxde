/**
 * apps/api/src/chart/dto/chart-meta.query.dto.ts
 * 参照: SPEC_v51_part11 §3.1 / §2.3「createZodDto 派生のみ・手書き禁止」
 */
import { createZodDto } from 'nestjs-zod';
import { ChartMetaQuerySchema } from '@fxde/types';
export class ChartMetaQueryDto extends createZodDto(ChartMetaQuerySchema) {}