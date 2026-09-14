import { z } from 'zod';

export const EngineObject = z.object({
  id: z.string().trim().min(1).max(64),
  type: z.literal('rectangle'),
  x: z.number(),
  y: z.number(),
  width: z.number().positive().max(1920),
  height: z.number().positive().max(1080),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  bounce: z.boolean().default(false),
});

export const EngineScene = z.object({
  id: z.string().trim().min(1).max(64),
  width: z.number().int().positive().max(1920),
  height: z.number().int().positive().max(1080),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  objects: z.array(EngineObject).min(1).max(50),
});

export const EngineScripts = z.object({
  'main.ts': z.string().max(20_000),
});

export const GameProjectDocument = z
  .object({
    engine: z.literal('phaser3'),
    engineVersion: z.string().trim().min(1).max(32),
    formatVersion: z.literal('1'),
    entryScene: z.string().trim().min(1).max(64),
    scenes: z.array(EngineScene).min(1).max(20),
    scripts: EngineScripts.default({ 'main.ts': '' }),
  })
  .refine(
    (value) => value.scenes.some((scene) => scene.id === value.entryScene),
    'Entry scene must exist',
  );

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

export type EngineObject = z.infer<typeof EngineObject>;
export type EngineScene = z.infer<typeof EngineScene>;
export type EngineScripts = z.infer<typeof EngineScripts>;
export type GameProjectDocument = z.infer<typeof GameProjectDocument>;
export type CreateGameProjectInput = z.infer<typeof CreateGameProjectInput>;
export type UpdateGameProjectInput = z.infer<typeof UpdateGameProjectInput>;
export type GameProjectSummary = z.infer<typeof GameProjectSummary>;
export type GameProjectPreview = z.infer<typeof GameProjectPreview>;
