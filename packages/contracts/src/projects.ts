import { z } from 'zod';

const HexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const Id = z.string().trim().min(1).max(64);

export const RectangleObject = z.object({
  id: Id,
  type: z.literal('rectangle'),
  x: z.number(),
  y: z.number(),
  width: z.number().positive().max(1920),
  height: z.number().positive().max(1080),
  color: HexColor,
  bounce: z.boolean().default(false),
  solid: z.boolean().default(false),
});

export const SpriteObject = z.object({
  id: Id,
  type: z.literal('sprite'),
  x: z.number(),
  y: z.number(),
  width: z.number().positive().max(1920),
  height: z.number().positive().max(1080),
  assetId: Id,
  bounce: z.boolean().default(false),
  solid: z.boolean().default(false),
  frames: z.number().int().positive().max(32).default(1),
});

export const EngineObject = z.discriminatedUnion('type', [
  RectangleObject,
  SpriteObject,
]);

export const EngineScene = z.object({
  id: Id,
  width: z.number().int().positive().max(1920),
  height: z.number().int().positive().max(1080),
  background: HexColor,
  gravityY: z.number().min(0).max(4000).default(0),
  objects: z.array(EngineObject).min(1).max(50),
});

export const EngineScripts = z.object({
  'main.ts': z.string().max(20_000),
});

export const EngineAsset = z.object({
  id: Id,
  kind: z.enum(['image', 'audio']),
  name: z.string().trim().min(1).max(80),
  mime: z.enum([
    'image/png',
    'image/jpeg',
    'audio/mpeg',
    'audio/ogg',
    'audio/wav',
  ]),
  dataBase64: z.string().min(1).max(400_000),
});

export const EngineAction = z.object({
  type: z.enum(['setVelocity', 'playSound', 'cameraFollow', 'save', 'load']),
  objectId: Id.optional(),
  vx: z.number().min(-2000).max(2000).optional(),
  vy: z.number().min(-2000).max(2000).optional(),
  assetId: Id.optional(),
});

export const EngineEvent = z.object({
  id: Id,
  trigger: z.enum(['create', 'keydown', 'collision']),
  key: z.string().trim().min(1).max(32).optional(),
  a: Id.optional(),
  b: Id.optional(),
  actions: z.array(EngineAction).min(1).max(8),
});

export const GameProjectDocument = z
  .object({
    engine: z.literal('phaser3'),
    engineVersion: z.string().trim().min(1).max(32),
    formatVersion: z.literal('1'),
    entryScene: Id,
    scenes: z.array(EngineScene).min(1).max(20),
    scripts: EngineScripts.default({ 'main.ts': '' }),
    assets: z.array(EngineAsset).max(20).default([]),
    events: z.array(EngineEvent).max(40).default([]),
    cameraFollow: z.string().trim().max(64).optional(),
    localSave: z.boolean().default(false),
  })
  .refine(
    (value) => value.scenes.some((scene) => scene.id === value.entryScene),
    'Entry scene must exist',
  )
  .refine((value) => {
    const assetIds = new Set(value.assets.map((asset) => asset.id));
    return value.scenes.every((scene) =>
      scene.objects.every(
        (item) => item.type !== 'sprite' || assetIds.has(item.assetId),
      ),
    );
  }, 'Sprite asset must exist')
  .refine((value) => {
    if (!value.cameraFollow) return true;
    return value.scenes.some((scene) =>
      scene.objects.some((item) => item.id === value.cameraFollow),
    );
  }, 'Camera follow target must exist');

export const CreateGameProjectInput = z.object({
  template: z.enum(['phaser3-starter']),
});

export const UpdateGameProjectInput = z.object({
  document: GameProjectDocument,
});

export const GameProjectSummary = z.object({
  id: z.string(),
  gameId: z.string(),
  templateId: z.string(),
  formatVersion: z.string(),
  document: GameProjectDocument,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const GameProjectPreview = z.object({
  html: z.string().min(1),
});

export type RectangleObject = z.infer<typeof RectangleObject>;
export type SpriteObject = z.infer<typeof SpriteObject>;
export type EngineObject = z.infer<typeof EngineObject>;
export type EngineScene = z.infer<typeof EngineScene>;
export type EngineScripts = z.infer<typeof EngineScripts>;
export type EngineAsset = z.infer<typeof EngineAsset>;
export type EngineAction = z.infer<typeof EngineAction>;
export type EngineEvent = z.infer<typeof EngineEvent>;
export type GameProjectDocument = z.infer<typeof GameProjectDocument>;
export type CreateGameProjectInput = z.infer<typeof CreateGameProjectInput>;
export type UpdateGameProjectInput = z.infer<typeof UpdateGameProjectInput>;
export type GameProjectSummary = z.infer<typeof GameProjectSummary>;
export type GameProjectPreview = z.infer<typeof GameProjectPreview>;
