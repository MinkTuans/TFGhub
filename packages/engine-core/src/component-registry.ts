import { z } from 'zod';
import { StableId } from './stable-id.js';

const finite = z.number().finite();
const nonNegativeFinite = finite.nonnegative();
const positiveFinite = finite.positive();
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);

type ComponentContext = {
  assetIds: ReadonlySet<string>;
  sceneIds: ReadonlySet<string>;
  objectIds: ReadonlySet<string>;
};

export type ComponentDefinition = {
  version: 1;
  defaults: () => unknown;
  schema: z.ZodTypeAny;
  validateContext: (properties: unknown, context: ComponentContext) => string[];
  runtimeHandlerKey: string;
  migrations: Readonly<Record<number, (value: unknown) => unknown>>;
};

function definition(
  type: string,
  schema: z.ZodTypeAny,
  defaults: () => unknown,
  validateContext: ComponentDefinition['validateContext'] = () => [],
): ComponentDefinition {
  return {
    version: 1,
    defaults,
    schema,
    validateContext,
    runtimeHandlerKey: `tfg.${type.toLowerCase()}.v1`,
    migrations: {},
  };
}

export const COMPONENT_TYPES = [
  'Transform',
  'Sprite',
  'Physics',
  'Animation',
  'Movement',
  'Health',
  'Collectible',
  'Enemy',
  'Portal',
  'Dialogue',
  'Audio',
  'Text',
  'Shape',
] as const;

export type ComponentType = (typeof COMPONENT_TYPES)[number];

const TransformProperties = z.object({
  x: finite,
  y: finite,
  rotation: finite,
  scaleX: finite,
  scaleY: finite,
}).strict();

const SpriteProperties = z.object({
  assetId: StableId.nullable(),
  frame: z.string().trim().min(1).max(120).nullable(),
  visible: z.boolean(),
  opacity: finite.min(0).max(1),
}).strict();

const PhysicsProperties = z.object({
  enabled: z.boolean(),
  bodyType: z.enum(['STATIC', 'DYNAMIC', 'KINEMATIC']),
  gravityScale: finite,
  isSensor: z.boolean(),
}).strict();

const AnimationProperties = z.object({
  activeClip: z.string().trim().min(1).max(120).nullable(),
  autoplay: z.boolean(),
  playbackRate: positiveFinite,
}).strict();

const MovementProperties = z.object({
  speed: nonNegativeFinite,
  jumpStrength: nonNegativeFinite,
}).strict();

const HealthProperties = z.object({
  current: nonNegativeFinite,
  maximum: positiveFinite,
}).strict().refine((value) => value.current <= value.maximum, {
  message: 'Current health cannot exceed maximum health',
  path: ['current'],
});

const CollectibleProperties = z.object({
  scoreValue: finite,
  destroyOnCollect: z.boolean(),
}).strict();

const EnemyProperties = z.object({
  contactDamage: nonNegativeFinite,
}).strict();

const PortalProperties = z.object({
  targetSceneId: StableId.nullable(),
  spawnObjectId: StableId.nullable(),
}).strict();

const DialogueProperties = z.object({
  speaker: z.string().trim().max(80),
  text: z.string().trim().max(5_000),
  choices: z.array(z.object({
    id: StableId,
    text: z.string().trim().min(1).max(200),
  }).strict()).max(100),
}).strict().superRefine((dialogue, context) => {
  const choiceIds = new Set<string>();
  dialogue.choices.forEach((choice, index) => {
    if (choiceIds.has(choice.id)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Dialogue choice IDs must be unique',
        path: ['choices', index, 'id'],
      });
    }
    choiceIds.add(choice.id);
  });
});

const AudioProperties = z.object({
  assetId: StableId.nullable(),
  loop: z.boolean(),
  volume: finite.min(0).max(1),
  autoplay: z.boolean(),
}).strict();

const TextProperties = z.object({
  text: z.string().max(5_000),
  fontSize: positiveFinite.max(512),
  color,
}).strict();

const ShapeProperties = z.object({
  kind: z.literal('RECTANGLE'),
  width: positiveFinite,
  height: positiveFinite,
  color,
}).strict();

function assetReference(
  properties: unknown,
  context: ComponentContext,
): string[] {
  const assetId =
    typeof properties === 'object' && properties !== null
      ? (properties as { assetId?: unknown }).assetId
      : undefined;
  return typeof assetId === 'string' && !context.assetIds.has(assetId)
    ? ['Component references an asset that is not declared by the project']
    : [];
}

export const componentRegistry: Readonly<Record<ComponentType, ComponentDefinition>> = {
  Transform: definition('Transform', TransformProperties, () => ({
    x: 0,
    y: 0,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
  })),
  Sprite: definition('Sprite', SpriteProperties, () => ({
    assetId: null,
    frame: null,
    visible: true,
    opacity: 1,
  }), assetReference),
  Physics: definition('Physics', PhysicsProperties, () => ({
    enabled: true,
    bodyType: 'STATIC',
    gravityScale: 1,
    isSensor: false,
  })),
  Animation: definition('Animation', AnimationProperties, () => ({
    activeClip: null,
    autoplay: true,
    playbackRate: 1,
  })),
  Movement: definition('Movement', MovementProperties, () => ({
    speed: 200,
    jumpStrength: 400,
  })),
  Health: definition('Health', HealthProperties, () => ({
    current: 100,
    maximum: 100,
  })),
  Collectible: definition('Collectible', CollectibleProperties, () => ({
    scoreValue: 1,
    destroyOnCollect: true,
  })),
  Enemy: definition('Enemy', EnemyProperties, () => ({ contactDamage: 10 })),
  Portal: definition('Portal', PortalProperties, () => ({
    targetSceneId: null,
    spawnObjectId: null,
  }), (properties, context) => {
    const portal = properties as { targetSceneId: string | null; spawnObjectId: string | null };
    const issues: string[] = [];
    if (portal.targetSceneId && !context.sceneIds.has(portal.targetSceneId)) {
      issues.push('Portal references a scene that does not exist');
    }
    if (portal.spawnObjectId && !context.objectIds.has(portal.spawnObjectId)) {
      issues.push('Portal references a spawn object that does not exist');
    }
    return issues;
  }),
  Dialogue: definition('Dialogue', DialogueProperties, () => ({
    speaker: '',
    text: '',
    choices: [],
  })),
  Audio: definition('Audio', AudioProperties, () => ({
    assetId: null,
    loop: false,
    volume: 1,
    autoplay: false,
  }), assetReference),
  Text: definition('Text', TextProperties, () => ({
    text: '',
    fontSize: 16,
    color: '#ffffff',
  })),
  Shape: definition('Shape', ShapeProperties, () => ({
    kind: 'RECTANGLE',
    width: 1,
    height: 1,
    color: '#ffffff',
  })),
};
