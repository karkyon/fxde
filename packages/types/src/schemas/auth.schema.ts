import { z } from 'zod';

export const RegisterSchema = z.object({
  email: z.string().email(),
  password: z
    .string()
    .min(12)
    .max(72)
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
      message: 'パスワードは英大文字・小文字・数字を各1文字以上含めてください',
    }),
});

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type RegisterDto = z.infer<typeof RegisterSchema>;
export type LoginDto    = z.infer<typeof LoginSchema>;