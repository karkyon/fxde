/**
 * apps/api/src/chart/dto/chart-prediction-overlay.query.dto.ts
 */
import { createZodDto } from 'nestjs-zod';
import { ChartPredictionOverlayQuerySchema } from '@fxde/types';
export class ChartPredictionOverlayQueryDto extends createZodDto(ChartPredictionOverlayQuerySchema) {}