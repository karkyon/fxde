// apps/api/src/modules/auth/dto/register.dto.ts
import { createZodDto } from 'nestjs-zod';
import { RegisterSchema } from '@fxde/types';

export class RegisterDto extends createZodDto(RegisterSchema) {}