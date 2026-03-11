// apps/api/src/modules/trades/dto/trades.dto.ts
import { createZodDto } from 'nestjs-zod';
import {
  CreateTradeSchema,
  UpdateTradeSchema,
  CloseTradeSchema,
  GetTradesQuerySchema,
  CreateTradeReviewSchema,
} from '@fxde/types';

export class CreateTradeDto       extends createZodDto(CreateTradeSchema) {}
export class UpdateTradeDto       extends createZodDto(UpdateTradeSchema) {}
export class CloseTradeDto        extends createZodDto(CloseTradeSchema) {}
export class GetTradesQueryDto    extends createZodDto(GetTradesQuerySchema) {}
export class CreateTradeReviewDto extends createZodDto(CreateTradeReviewSchema) {}