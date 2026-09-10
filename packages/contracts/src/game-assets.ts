import { z } from 'zod';

export const GameAssetKind = z.enum(['IMAGE', 'AUDIO', 'FONT', 'OTHER']);
export const GameAssetState = z.enum([
  'UPLOADING',
  'READY',
  'TOMBSTONED',
  'GC_PENDING',
]);
export const AssetCategory = z.enum([
  'MAP_TILESET',
  'CHARACTER',
  'NPC',
  'ITEM',
  'UI',
  'AUDIO',
  'EFFECT',
  'IMAGE',
  'USER',
]);
const displayName = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(/^[^\x00-\x1f\x7f/\\]+$/);
export const UploadGameAssetInput = z
  .object({
    uploadId: z.string().uuid(),
    displayName: displayName.optional(),
    category: AssetCategory.default('USER'),
  })
  .strict();
export const UpdateGameAssetInput = z
  .object({
    displayName: displayName.optional(),
    category: AssetCategory.optional(),
  })
  .strict()
  .refine(
    (value) => value.displayName !== undefined || value.category !== undefined,
    'Provide a name or category',
  );
export const ListGameAssetsInput = z
  .object({
    search: z.string().trim().max(160).default(''),
    kind: GameAssetKind.optional(),
    category: AssetCategory.optional(),
    state: GameAssetState.default('READY'),
    offset: z.coerce.number().int().min(0).max(100000).default(0),
    limit: z.coerce.number().int().min(1).max(100).default(30),
  })
  .strict();
export const AssetImportMetadata = z
  .object({
    category: AssetCategory.optional(),
    image: z
      .object({
        format: z.enum(['png', 'jpeg', 'webp']),
        orientation: z.number().int().min(1).max(8),
        colorSpace: z.string().max(32),
      })
      .strict()
      .optional(),
    audio: z
      .object({
        channels: z.number().int().min(1).max(2),
        sampleRate: z.number().int().min(8000).max(48000),
        bitsPerSample: z.literal(16),
      })
      .strict()
      .optional(),
    thumbnail: z
      .object({
        recipe: z.string().max(100),
        contentHash: z.string().regex(/^[a-f0-9]{64}$/),
        width: z.number().int().positive(),
        height: z.number().int().positive(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type AssetImportMetadata = z.infer<typeof AssetImportMetadata>;
export type ListGameAssetsInput = z.infer<typeof ListGameAssetsInput>;
export type UpdateGameAssetInput = z.infer<typeof UpdateGameAssetInput>;
export type UploadGameAssetInput = z.infer<typeof UploadGameAssetInput>;
export const GameAssetSummary = z
  .object({
    id: z.string(),
    projectId: z.string(),
    kind: GameAssetKind,
    state: GameAssetState,
    displayName: z.string(),
    contentHash: z.string(),
    mimeType: z.string(),
    byteSize: z.number().int().nonnegative(),
    width: z.number().nullable(),
    height: z.number().nullable(),
    durationMs: z.number().nullable(),
    metadata: AssetImportMetadata,
    contentUrl: z.string().nullable(),
    thumbnailUrl: z.string().nullable(),
    references: z.object({
      revisions: z.number().int(),
      builds: z.number().int(),
    }),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    tombstonedAt: z.string().datetime().nullable(),
  })
  .strict();
export type GameAssetSummary = z.infer<typeof GameAssetSummary>;
export const ListGameAssetsResponse = z.object({
  items: z.array(GameAssetSummary),
  total: z.number().int(),
  offset: z.number().int(),
  limit: z.number().int(),
});
