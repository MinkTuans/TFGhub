import { z } from 'zod';
import { EngineProjectV1 } from '../project-schema.js';
import {
  createLegacyIdentityAllocator,
  stableStringify,
  type LegacyAdapterResult,
} from './identity.js';

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const point = z.object({ x: z.number().int().nonnegative(), y: z.number().int().nonnegative(), color }).strict();
const PlatformerV0 = z.object({
  sourceType: z.literal('PLATFORMER'),
  canvas: z.object({ width: z.number().int().min(320).max(1920), height: z.number().int().min(240).max(1080) }).strict(),
  backgroundColor: color,
  player: point,
  goal: point,
  platforms: z.array(z.object({
    x: z.number().int().nonnegative(),
    y: z.number().int().nonnegative(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    color,
  }).strict()).max(100),
}).strict().superRefine((platformer, context) => {
  (['player', 'goal'] as const).forEach((name) => {
    const value = platformer[name];
    if (value.x >= platformer.canvas.width || value.y >= platformer.canvas.height) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: `${name} coordinates must be inside the canvas`, path: [name] });
    }
  });
  platformer.platforms.forEach((platform, index) => {
    if (platform.x + platform.width > platformer.canvas.width || platform.y + platform.height > platformer.canvas.height) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Platform geometry must be inside the canvas', path: ['platforms', index] });
    }
  });
});

function transform(id: string, x: number, y: number, scaleX = 1, scaleY = 1) {
  return { id, type: 'Transform' as const, version: 1 as const, properties: { x, y, rotation: 0, scaleX, scaleY } };
}

function physics(id: string, bodyType: 'STATIC' | 'DYNAMIC') {
  return { id, type: 'Physics' as const, version: 1 as const, properties: { enabled: true, bodyType, gravityScale: 1, isSensor: false } };
}

function shape(id: string, width: number, height: number, color: string) {
  return { id, type: 'Shape' as const, version: 1 as const, properties: { kind: 'RECTANGLE' as const, width, height, color } };
}

export function adaptPlatformerV0(gameId: string, raw: unknown): LegacyAdapterResult {
  const parsed = PlatformerV0.safeParse(raw);
  if (!parsed.success) return {
    status: 'INVALID_LEGACY',
    raw,
    diagnostics: parsed.error.issues.map((issue) => `${issue.path.join('.') || 'source'}: ${issue.message}`),
  };
  const source = parsed.data;
  const ids = createLegacyIdentityAllocator(gameId);
  const projectId = ids.role('project', gameId, 'canonical-project');
  const sceneId = ids.role('scene', projectId, 'platformer-main');
  const playerId = ids.role('object', sceneId, 'player');
  const goalId = ids.role('object', sceneId, 'goal');
  const playerComponents = [
    transform(ids.role('component', playerId, 'transform'), source.player.x, source.player.y),
    shape(ids.role('component', playerId, 'shape'), 24, 24, source.player.color),
    physics(ids.role('component', playerId, 'physics'), 'DYNAMIC'),
    { id: ids.role('component', playerId, 'movement'), type: 'Movement' as const, version: 1 as const, properties: { speed: 200, jumpStrength: 400 } },
  ];
  const goalComponents = [
    transform(ids.role('component', goalId, 'transform'), source.goal.x, source.goal.y),
    shape(ids.role('component', goalId, 'shape'), 24, 24, source.goal.color),
    { id: ids.role('component', goalId, 'collectible'), type: 'Collectible' as const, version: 1 as const, properties: { scoreValue: 0, destroyOnCollect: false } },
  ];
  const seenPlatforms = new Map<string, number>();
  const platforms = source.platforms.map((platform, index) => {
    const fingerprint = stableStringify(platform);
    const duplicateIndex = seenPlatforms.get(fingerprint) ?? 0;
    seenPlatforms.set(fingerprint, duplicateIndex + 1);
    const objectId = ids.content('object', sceneId, platform, duplicateIndex);
    return {
      id: objectId,
      parentId: null,
      name: `Platform ${index + 1}`,
      enabled: true,
      order: index + 2,
      components: [
        transform(ids.role('component', objectId, 'transform'), platform.x, platform.y),
        shape(ids.role('component', objectId, 'shape'), platform.width, platform.height, platform.color),
        physics(ids.role('component', objectId, 'physics'), 'STATIC'),
      ],
    };
  });
  const completionEventId = ids.role('event', sceneId, 'goal-collision');
  const completionActionId = ids.role('action', completionEventId, 'complete-game');
  const canonical = {
    schemaVersion: 1,
    projectId,
    engineFamily: 'TFG_ENGINE',
    entrySceneId: sceneId,
    settings: { viewport: source.canvas },
    assetIds: [],
    scenes: [{
      id: sceneId,
      name: 'Platformer',
      order: 0,
      backgroundColor: source.backgroundColor,
      objects: [
        { id: playerId, parentId: null, name: 'Player', enabled: true, order: 0, components: playerComponents },
        { id: goalId, parentId: null, name: 'Goal', enabled: true, order: 1, components: goalComponents },
        ...platforms,
      ],
    }],
    variables: { global: [], player: [], scene: {} },
    events: [{
      id: completionEventId,
      version: 1,
      name: 'Reach the goal',
      enabled: true,
      order: 0,
      trigger: { type: 'COLLISION', firstObjectId: playerId, secondObjectId: goalId },
      condition: null,
      actions: [{ id: completionActionId, version: 1, type: 'COMPLETE_GAME' }],
    }],
    prefabs: [],
  };
  const result = EngineProjectV1.safeParse(canonical);
  if (!result.success) return {
    status: 'INVALID_LEGACY',
    raw,
    diagnostics: result.error.issues.map((issue) => `${issue.path.join('.') || 'project'}: ${issue.message}`),
  };
  return { status: 'CONVERTED', project: result.data, canonicalJson: `${JSON.stringify(result.data, null, 2)}\n` };
}
