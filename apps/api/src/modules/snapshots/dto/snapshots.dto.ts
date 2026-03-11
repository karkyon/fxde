import { createZodDto } from 'nestjs-zod';
import {
  GetSnapshotsQuerySchema,
  GetSnapshotsLatestQuerySchema,
} from '@fxde/types';

/**
 * GET /api/v1/snapshots クエリ DTO
 */
export class GetSnapshotsQueryDto extends createZodDto(GetSnapshotsQuerySchema) {}

/**
 * GET /api/v1/snapshots/latest クエリ DTO
 */
export class GetSnapshotsLatestQueryDto extends createZodDto(GetSnapshotsLatestQuerySchema) {}