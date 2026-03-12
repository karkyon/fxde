/**
 * apps/api/src/chart/dto/chart-candles.query.dto.ts
 * 参照: SPEC_v51_part11 §3.2 / §2.3「createZodDto 派生のみ・手書き禁止」
 */
import { createZodDto } from 'nestjs-zod';
import { ChartCandlesQuerySchema } from '@fxde/types';
export class ChartCandlesQueryDto extends createZodDto(ChartCandlesQuerySchema) {}