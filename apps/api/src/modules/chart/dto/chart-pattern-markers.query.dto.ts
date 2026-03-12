/**
 * apps/api/src/chart/dto/chart-pattern-markers.query.dto.ts
 */
import { createZodDto } from 'nestjs-zod';
import { ChartPatternMarkersQuerySchema } from '@fxde/types';
export class ChartPatternMarkersQueryDto extends createZodDto(ChartPatternMarkersQuerySchema) {}