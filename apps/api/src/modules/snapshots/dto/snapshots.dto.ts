/**
 * apps/api/src/modules/snapshots/dto/snapshots.dto.ts
 *
 * 変更内容（round8-reaudit）:
 *   [P1] EvaluateSnapshotBodyDto を追加
 *        POST /api/v1/snapshots/evaluate 用（EvaluateSnapshotSchema から派生）
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