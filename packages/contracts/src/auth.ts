import { z } from 'zod';

export const RegisterInput = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(128)
    .regex(/\p{Ll}/u)
    .regex(/\p{Lu}/u)
    .regex(/[0-9]/)
    .regex(/[\p{P}\p{S}]/u),
});

export const LoginInput = RegisterInput;
