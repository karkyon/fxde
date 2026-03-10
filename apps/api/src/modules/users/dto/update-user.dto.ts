// apps/api/src/modules/users/dto/update-user.dto.ts
import { createZodDto } from 'nestjs-zod';
import { UpdateUserSchema } from '@fxde/types';

export class UpdateUserDto extends createZodDto(UpdateUserSchema) {}
