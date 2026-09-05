import { z } from 'zod';

export const RegisterInput = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(10).max(128),
});

export const LoginInput = RegisterInput;
