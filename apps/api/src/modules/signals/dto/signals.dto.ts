// apps/api/src/modules/signals/dto/signals.dto.ts
//
// 変更内容:
//   [Task2] GetLatestSignalQueryDto を削除
//           → GET /signals/latest は SPEC_v51_part10 §6.5 に存在しないエンドポイントのため
//           → GetSignalsLatestQuerySchema import も削除
//
import { createZodDto } from 'nestjs-zod';
import { GetSignalsQuerySchema } from '@fxde/types';

/**
 * GET /api/v1/signals クエリ DTO
 * symbol / timeframe / type / from / to / unacknowledgedOnly / page / limit
 * 参照: SPEC_v51_part10 §6.5（正本）
 */
export class GetSignalsQueryDto extends createZodDto(GetSignalsQuerySchema) {}