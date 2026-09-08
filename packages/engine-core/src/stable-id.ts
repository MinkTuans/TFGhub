import { z } from 'zod';

export const StableId = z.string()
  .toLowerCase()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    'Stable ID must be a canonical UUID version 1 through 5',
  );

export type StableId = z.infer<typeof StableId>;

export function createStableId(): StableId {
  return StableId.parse(globalThis.crypto.randomUUID());
}
