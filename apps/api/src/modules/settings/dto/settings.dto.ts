// apps/api/src/modules/settings/dto/settings.dto.ts
import { createZodDto } from 'nestjs-zod';
import {
  UpdateSettingsSchema,
  ApplyPresetSchema,
} from '@fxde/types';

export class UpdateSettingsDto extends createZodDto(UpdateSettingsSchema) {}
export class ApplyPresetDto    extends createZodDto(ApplyPresetSchema) {}