import { z } from 'zod';

export const GameSourceType = z.enum(['UPLOAD', 'CODE', 'STORY', 'PLATFORMER']);
export const GameReviewState = z.enum(['DRAFT', 'PENDING', 'APPROVED', 'REJECTED']);

export const CreateGameInput = z.object({
  title: z.string().trim().min(1).max(80),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().trim().max(2000).default(''),
  accessMode: z.enum(['GUEST_ALLOWED', 'AUTH_REQUIRED']).default('GUEST_ALLOWED'),
  sourceType: GameSourceType.default('UPLOAD'),
});

export const UpdateGameInput = CreateGameInput.pick({
  title: true,
  description: true,
  accessMode: true,
}).partial().refine((value) => Object.keys(value).length > 0, 'At least one field is required');

export const CodeProjectInput = z.object({
  sourceType: z.literal('CODE'),
  html: z.string().max(50_000),
  css: z.string().max(50_000),
  javascript: z.string().max(50_000),
});

const StoryProjectShape = z.object({
  sourceType: z.literal('STORY'),
  startSceneId: z.string().trim().min(1).max(64),
  scenes: z.array(z.object({
    id: z.string().trim().min(1).max(64),
    speaker: z.string().trim().max(80),
    dialogue: z.string().trim().max(5_000),
    backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    choices: z.array(z.object({
      text: z.string().trim().min(1).max(200),
      targetSceneId: z.string().trim().min(1).max(64),
    })).max(12),
  })).min(1).max(100),
});

function validateStoryProject(
  value: z.infer<typeof StoryProjectShape>,
  context: z.RefinementCtx,
) {
  const sceneIds = new Set<string>();

  for (const [index, scene] of value.scenes.entries()) {
    if (sceneIds.has(scene.id)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Scene identifiers must be unique',
        path: ['scenes', index, 'id'],
      });
    }
    sceneIds.add(scene.id);
  }

  if (!sceneIds.has(value.startSceneId)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'The start scene must exist',
      path: ['startSceneId'],
    });
  }

  for (const [sceneIndex, scene] of value.scenes.entries()) {
    for (const [choiceIndex, choice] of scene.choices.entries()) {
      if (!sceneIds.has(choice.targetSceneId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Choice targets must reference an existing scene',
          path: ['scenes', sceneIndex, 'choices', choiceIndex, 'targetSceneId'],
        });
      }
    }
  }
}

export const StoryProjectInput = StoryProjectShape.superRefine(validateStoryProject);

const PointShape = z.object({
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

const PlatformerProjectShape = z.object({
  sourceType: z.literal('PLATFORMER'),
  canvas: z.object({
    width: z.number().int().min(320).max(1920),
    height: z.number().int().min(240).max(1080),
  }),
  backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  player: PointShape,
  goal: PointShape,
  platforms: z.array(z.object({
    x: z.number().int().nonnegative(),
    y: z.number().int().nonnegative(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  })).max(100),
});

function validatePlatformerProject(
  value: z.infer<typeof PlatformerProjectShape>,
  context: z.RefinementCtx,
) {
  for (const pointName of ['player', 'goal'] as const) {
    const point = value[pointName];
    if (point.x >= value.canvas.width || point.y >= value.canvas.height) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${pointName} coordinates must be inside the canvas`,
        path: [pointName],
      });
    }
  }

  for (const [index, platform] of value.platforms.entries()) {
    if (
      platform.x + platform.width > value.canvas.width
      || platform.y + platform.height > value.canvas.height
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Platform geometry must be inside the canvas',
        path: ['platforms', index],
      });
    }
  }
}

export const PlatformerProjectInput = PlatformerProjectShape.superRefine(validatePlatformerProject);

export const GameProjectInput = z.discriminatedUnion('sourceType', [
  CodeProjectInput,
  StoryProjectShape,
  PlatformerProjectShape,
]).superRefine((value, context) => {
  if (value.sourceType === 'STORY') validateStoryProject(value, context);
  if (value.sourceType === 'PLATFORMER') validatePlatformerProject(value, context);
});

export const ReviewGameInput = z.object({
  reviewNote: z.string().trim().min(1).max(500),
});

export const GameSummary = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  description: z.string(),
  visibility: z.enum(['DRAFT', 'PUBLIC', 'UNLISTED']),
  accessMode: z.enum(['GUEST_ALLOWED', 'AUTH_REQUIRED']),
  moderationState: z.enum(['CLEAR', 'FLAGGED', 'QUARANTINED']),
  sourceType: GameSourceType,
  reviewState: GameReviewState,
  projectData: z.unknown().refine((value) => value !== undefined).nullable(),
  artifactVersion: z.number().int().nonnegative(),
  reviewNote: z.string().max(500).nullable(),
  submittedAt: z.string().datetime().nullable(),
  reviewedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const DiscoverGamesInput = z.object({
  query: z.string().trim().max(200).optional(),
  cursor: z.string().min(1).max(512).optional(),
  limit: z.coerce.number().int().positive().optional(),
});

export const PublicGameSummary = z.object({
  slug: z.string(),
  title: z.string(),
  description: z.string(),
  developer: z.object({ displayName: z.string() }),
  createdAt: z.string().datetime(),
});

export const DiscoverGamesResponse = z.object({
  games: z.array(PublicGameSummary),
  nextCursor: z.string().nullable(),
});

export type UpdateGameInput = z.infer<typeof UpdateGameInput>;
export type GameSourceType = z.infer<typeof GameSourceType>;
export type GameReviewState = z.infer<typeof GameReviewState>;
export type CodeProjectInput = z.infer<typeof CodeProjectInput>;
export type StoryProjectInput = z.infer<typeof StoryProjectInput>;
export type PlatformerProjectInput = z.infer<typeof PlatformerProjectInput>;
export type GameProjectInput = z.infer<typeof GameProjectInput>;
export type ReviewGameInput = z.infer<typeof ReviewGameInput>;
export type GameSummary = z.infer<typeof GameSummary>;
export type DiscoverGamesInput = z.infer<typeof DiscoverGamesInput>;
export type PublicGameSummary = z.infer<typeof PublicGameSummary>;
export type DiscoverGamesResponse = z.infer<typeof DiscoverGamesResponse>;
