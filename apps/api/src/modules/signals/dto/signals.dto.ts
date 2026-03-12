// apps/api/src/modules/signals/dto/signals.dto.ts
import { createZodDto } from 'nestjs-zod';
import {
  GetSignalsQuerySchema,
  GetSignalsLatestQuerySchema,
} from '@fxde/types';

/**
 * GET /api/v1/signals クエリ DTO
 * 参照: packages/types/src/schemas/signal.schema.ts
 */
export class GetSignalsQueryDto     extends createZodDto(GetSignalsQuerySchema) {}

/**
 * GET /api/v1/signals/latest クエリ DTO
 */
export class GetLatestSignalQueryDto extends createZodDto(GetSignalsLatestQuerySchema) {}