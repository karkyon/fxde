/**
 * apps/api/src/chart/dto/chart-indicators.query.dto.ts
 */
import { createZodDto } from 'nestjs-zod';
import { ChartIndicatorsQuerySchema } from '@fxde/types';
export class ChartIndicatorsQueryDto extends createZodDto(ChartIndicatorsQuerySchema) {}