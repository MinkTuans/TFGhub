import { z } from 'zod';

export const DeveloperProfileInput = z.object({
  displayName: z.string().trim().min(2).max(50),
  bio: z.string().trim().max(500).default(''),
});
