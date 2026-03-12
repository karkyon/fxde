/**
 * apps/api/src/chart/dto/chart-trades.query.dto.ts
 */
import { createZodDto } from 'nestjs-zod';
import { ChartTradesQuerySchema } from '@fxde/types';
export class ChartTradesQueryDto extends createZodDto(ChartTradesQuerySchema) {}