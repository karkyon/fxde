import { createZodDto } from 'nestjs-zod';
import {
  GetSnapshotsQuerySchema,
  GetSnapshotsLatestQuerySchema,
  CaptureSnapshotSchema,
} from '@fxde/types';

/**
 * POST /api/v1/snapshots/capture リクエスト DTO
 * 参照: SPEC_v51_part3 §7
 */
export class CaptureSnapshotBodyDto extends createZodDto(CaptureSnapshotSchema) {}

/**
 * GET /api/v1/snapshots クエリ DTO
 */
export class GetSnapshotsQueryDto extends createZodDto(GetSnapshotsQuerySchema) {}

/**
 * GET /api/v1/snapshots/latest クエリ DTO
 */
export class GetSnapshotsLatestQueryDto extends createZodDto(GetSnapshotsLatestQuerySchema) {}