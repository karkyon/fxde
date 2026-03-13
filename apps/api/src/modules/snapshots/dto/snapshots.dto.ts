/**
 * apps/api/src/modules/snapshots/dto/snapshots.dto.ts
 *
 * 役割: Snapshots API の NestJS Zod DTO 定義
 *   - GET  /api/v1/snapshots         クエリ DTO
 *   - GET  /api/v1/snapshots/latest  クエリ DTO
 *   - POST /api/v1/snapshots/capture ボディ DTO
 *   - POST /api/v1/snapshots/evaluate ボディ DTO
 *
 * 参照仕様: SPEC_v51_part3 §7「Snapshots API」
 *           packages/types/src/schemas/snapshot.schema.ts（正本）
 */
import { createZodDto } from 'nestjs-zod';
import {
  GetSnapshotsQuerySchema,
  GetSnapshotsLatestQuerySchema,
  CaptureSnapshotSchema,
  EvaluateSnapshotSchema,
} from '@fxde/types';

/**
 * GET /api/v1/snapshots クエリ DTO
 */
export class GetSnapshotsQueryDto extends createZodDto(GetSnapshotsQuerySchema) {}

/**
 * GET /api/v1/snapshots/latest クエリ DTO
 */
export class GetSnapshotsLatestQueryDto extends createZodDto(GetSnapshotsLatestQuerySchema) {}

/**
 * POST /api/v1/snapshots/capture ボディ DTO
 */
export class CaptureSnapshotBodyDto extends createZodDto(CaptureSnapshotSchema) {}

/**
 * POST /api/v1/snapshots/evaluate ボディ DTO
 * DB 保存なし・capture と同一入力形式
 */
export class EvaluateSnapshotBodyDto extends createZodDto(EvaluateSnapshotSchema) {}