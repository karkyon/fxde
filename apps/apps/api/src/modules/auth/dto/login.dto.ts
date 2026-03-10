// apps/api/src/modules/auth/dto/login.dto.ts
import { createZodDto } from 'nestjs-zod';
import { LoginSchema } from '@fxde/types';

export class LoginDto extends createZodDto(LoginSchema) {}