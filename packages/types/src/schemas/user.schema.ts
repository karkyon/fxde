// packages/types/src/schemas/user.schema.ts
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

// UserMeResponse を Zod Schema として追加
// （レスポンス型の正本。Controller の返却型に使用）
export const UserMeResponseSchema = z.object({
  id:          z.string(),
  email:       z.string().email(),
  role:        z.enum(['FREE', 'BASIC', 'PRO', 'PRO_PLUS', 'ADMIN']),
  status:      z.enum(['ACTIVE', 'SUSPENDED']),
  createdAt:   z.string(),
  lastLoginAt: z.string().nullable(),
});

export type UserMeResponse = z.infer<typeof UserMeResponseSchema>;