import { z } from 'zod';

export const WebEngineCapability = z.enum([
  'wasm',
  'capabilityFetch',
  'blobWorker',
  'indexedDb',
  'webSocket',
  'blobUrl',
]);

export const WebEngineCapabilityContract = z.object({
  runtime: z.string().trim().min(1),
  capabilities: z.array(WebEngineCapability).min(1).superRefine((value, ctx) => {
    if (new Set(value).size !== value.length)
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Capabilities must be distinct' });
  }),
});

export type WebEngineCapability = z.infer<typeof WebEngineCapability>;
export type WebEngineCapabilityContract = z.infer<typeof WebEngineCapabilityContract>;

export function validateWebEngineCapabilityContract(value: unknown): WebEngineCapabilityContract {
  return WebEngineCapabilityContract.parse(value);
}
