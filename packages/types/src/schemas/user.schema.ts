// packages/types/src/schemas/auth.schema.ts
import { z } from 'zod';

export const UpdateUserSchema = z.object({
  email:    z.string().email().optional(),
  password: z
    .string()
    .min(12)
    .max(72)
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .optional(),
});

export type UpdateUserDto = z.infer<typeof UpdateUserSchema>;