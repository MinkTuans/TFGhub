import { describe, expect, it } from 'vitest';
import {
  COMPONENT_TYPES,
  EngineProjectV1,
  componentRegistry,
  readEngineProject,
} from './index.js';

const ids = {
  project: '550e8400-e29b-41d4-a716-446655440000',
  scene: '550e8400-e29b-41d4-a716-446655440001',
  object: '550e8400-e29b-41d4-a716-446655440002',
  component: '550e8400-e29b-41d4-a716-446655440003',
  asset: '550e8400-e29b-41d4-a716-446655440004',
  prefab: '550e8400-e29b-41d4-a716-446655440005',
};

function project() {
  return {
    schemaVersion: 1,
    projectId: ids.project,
    engineFamily: 'TFG_ENGINE',
    entrySceneId: ids.scene,
    settings: { viewport: { width: 1280, height: 720 } },
    assetIds: [ids.asset],
    scenes: [
      {
        id: ids.scene,
        name: 'Level 1',
        order: 0,
        objects: [
          {
            id: ids.object,
            parentId: null,
            name: 'Hero',
            enabled: true,
            order: 0,
            components: [
              {
                id: ids.component,
                type: 'Sprite',
                version: 1,
                properties: {
                  assetId: ids.asset,
                  frame: null,
                  visible: true,
                  opacity: 1,
                },
              },
            ],
          },
        ],
      },
    ],
    variables: { global: [], player: [], scene: {} },
    events: [],
    prefabs: [
      {
        id: ids.prefab,
        name: 'Empty prefab',
        components: [],
      },
    ],
  } as const;
}

describe('EngineProjectV1', () => {
  it('round-trips one canonical project', () => {
    expect(EngineProjectV1.parse(project())).toEqual(project());
    expect(readEngineProject(project())).toMatchObject({
      status: 'SUPPORTED',
      project: project(),
    });
  });

  it('registers exactly the initial component types with defaults and handlers', () => {
    expect(COMPONENT_TYPES).toEqual([
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
    ]);
    for (const type of COMPONENT_TYPES) {
      const definition = componentRegistry[type];
      expect(definition.version).toBe(1);
      expect(definition.runtimeHandlerKey).toBe(`tfg.${type.toLowerCase()}.v1`);
      expect(definition.schema.safeParse(definition.defaults()).success).toBe(true);
    }
  });

  it.each([
    ['missing entry scene', (value: ReturnType<typeof project>) => ({ ...value, entrySceneId: ids.asset })],
    ['missing sprite asset', (value: ReturnType<typeof project>) => ({ ...value, assetIds: [] })],
    ['duplicate scene ID', (value: ReturnType<typeof project>) => ({ ...value, scenes: [...value.scenes, value.scenes[0]] })],
    ['duplicate object ID', (value: ReturnType<typeof project>) => ({
      ...value,
      scenes: [{ ...value.scenes[0], objects: [...value.scenes[0].objects, value.scenes[0].objects[0]] }],
    })],
    ['duplicate component ID', (value: ReturnType<typeof project>) => ({
      ...value,
      scenes: [{
        ...value.scenes[0],
        objects: [{
          ...value.scenes[0].objects[0],
          components: [
            ...value.scenes[0].objects[0].components,
            value.scenes[0].objects[0].components[0],
          ],
        }],
      }],
    })],
  ])('rejects semantic corruption: %s', (_name, corrupt) => {
    expect(EngineProjectV1.safeParse(corrupt(project())).success).toBe(false);
  });

  it('rejects parent cycles and dangling parents', () => {
    const base = project();
    const secondId = '550e8400-e29b-41d4-a716-446655440006';
    const child = {
      ...base.scenes[0].objects[0],
      id: secondId,
      parentId: ids.object,
      name: 'Child',
      components: [],
    };

    const cycle = {
      ...base,
      scenes: [{
        ...base.scenes[0],
        objects: [
          { ...base.scenes[0].objects[0], parentId: secondId },
          child,
        ],
      }],
    };
    expect(EngineProjectV1.safeParse(cycle).success).toBe(false);

    const dangling = {
      ...base,
      scenes: [{
        ...base.scenes[0],
        objects: [{ ...base.scenes[0].objects[0], parentId: ids.asset }],
      }],
    };
    expect(EngineProjectV1.safeParse(dangling).success).toBe(false);
  });

  it('rejects invalid component properties and non-finite transforms', () => {
    const base = project();
    const invalid = {
      ...base,
      scenes: [{
        ...base.scenes[0],
        objects: [{
          ...base.scenes[0].objects[0],
          components: [{
            ...base.scenes[0].objects[0].components[0],
            type: 'Transform',
            properties: {
              x: Number.POSITIVE_INFINITY,
              y: 0,
              rotation: 0,
              scaleX: 1,
              scaleY: 1,
            },
          }],
        }],
      }],
    };
    expect(EngineProjectV1.safeParse(invalid).success).toBe(false);
  });

  it('requires every component to carry an explicit properties value', () => {
    const base = project();
    const component = base.scenes[0].objects[0].components[0];
    const { properties: _properties, ...withoutProperties } = component;

    expect(EngineProjectV1.safeParse({
      ...base,
      scenes: [{
        ...base.scenes[0],
        objects: [{
          ...base.scenes[0].objects[0],
          components: [withoutProperties],
        }],
      }],
    }).success).toBe(false);
  });

  it('normalizes stable IDs nested inside component properties', () => {
    const base = project();
    const upperAssetId = ids.asset.toUpperCase();
    const parsed = EngineProjectV1.parse({
      ...base,
      assetIds: [upperAssetId],
      scenes: [{
        ...base.scenes[0],
        objects: [{
          ...base.scenes[0].objects[0],
          components: [{
            ...base.scenes[0].objects[0].components[0],
            properties: {
              ...base.scenes[0].objects[0].components[0].properties,
              assetId: upperAssetId,
            },
          }],
        }],
      }],
    });

    expect(parsed.scenes[0]?.objects[0]?.components[0]?.properties).toMatchObject({
      assetId: ids.asset,
    });
  });

  it('rejects duplicate stable choice IDs in a Dialogue component', () => {
    const base = project();
    const choiceId = '550e8400-e29b-41d4-a716-446655440007';
    const dialogue = {
      id: ids.component,
      type: 'Dialogue',
      version: 1,
      properties: {
        speaker: 'Guide',
        text: 'Choose.',
        choices: [
          { id: choiceId, text: 'Left' },
          { id: choiceId, text: 'Right' },
        ],
      },
    };

    expect(EngineProjectV1.safeParse({
      ...base,
      scenes: [{
        ...base.scenes[0],
        objects: [{ ...base.scenes[0].objects[0], components: [dialogue] }],
      }],
    }).success).toBe(false);
  });

  it('bounds scenes, objects, components, assets, prefabs, and viewport size', () => {
    const base = project();
    expect(EngineProjectV1.safeParse({
      ...base,
      settings: { viewport: { width: 0, height: 720 } },
    }).success).toBe(false);
    expect(EngineProjectV1.safeParse({
      ...base,
      assetIds: Array.from({ length: 1001 }, () => ids.asset),
    }).success).toBe(false);
    expect(EngineProjectV1.safeParse({
      ...base,
      scenes: Array.from({ length: 101 }, () => base.scenes[0]),
    }).success).toBe(false);
  });

  it('preserves malformed and future raw inputs instead of replacing them', () => {
    const malformed = { schemaVersion: 1, projectId: 'not-an-id', privateField: { keep: true } };
    const future = { schemaVersion: 2, projectId: ids.project, futureField: { keep: true } };

    const malformedResult = readEngineProject(malformed);
    const futureResult = readEngineProject(future);

    expect(malformedResult).toMatchObject({ status: 'INVALID' });
    expect(malformedResult.raw).toBe(malformed);
    expect(futureResult).toEqual({ status: 'UNSUPPORTED_FUTURE_SCHEMA', raw: future, schemaVersion: 2 });
    expect(futureResult.raw).toBe(future);
  });
});
