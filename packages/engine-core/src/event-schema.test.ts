import { describe, expect, it } from 'vitest';
import {
  ACTION_TYPES,
  CONDITION_TYPES,
  EVENT_LIMITS,
  EngineProjectV1,
  GameEventV1,
  TRIGGER_TYPES,
  readEngineProject,
} from './index.js';

const id = (suffix: string) => `550e8400-e29b-41d4-a716-44665544${suffix}`;

const ids = {
  project: id('0000'),
  scene: id('0001'),
  secondScene: id('0002'),
  object: id('0003'),
  component: id('0004'),
  dialogue: id('0005'),
  health: id('0006'),
  asset: id('0007'),
  prefab: id('0008'),
  variable: id('0009'),
  sceneVariable: id('0010'),
  choice: id('0011'),
  event: id('0012'),
  condition: id('0013'),
  action: id('0014'),
};

function event(overrides: Record<string, unknown> = {}) {
  return {
    id: ids.event,
    version: 1,
    name: 'Start game',
    enabled: true,
    order: 0,
    trigger: { type: 'GAME_START' },
    condition: null,
    actions: [{ id: ids.action, version: 1, type: 'ADD_SCORE', amount: 1 }],
    ...overrides,
  };
}

function project(events: unknown[] = [event()]) {
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
                properties: { assetId: ids.asset, frame: null, visible: true, opacity: 1 },
              },
              {
                id: ids.dialogue,
                type: 'Dialogue',
                version: 1,
                properties: {
                  speaker: 'Guide',
                  text: 'Choose',
                  choices: [{ id: ids.choice, text: 'Continue' }],
                },
              },
              {
                id: ids.health,
                type: 'Health',
                version: 1,
                properties: { current: 100, maximum: 100 },
              },
            ],
          },
        ],
      },
      { id: ids.secondScene, name: 'Level 2', order: 1, objects: [] },
    ],
    variables: {
      global: [{ id: ids.variable, name: 'Score', type: 'NUMBER', initialValue: 0 }],
      player: [],
      scene: {
        [ids.scene]: [{ id: ids.sceneVariable, name: 'Door open', type: 'BOOLEAN', initialValue: false }],
      },
    },
    events,
    prefabs: [{ id: ids.prefab, name: 'Enemy', components: [] }],
  };
}

describe('GameEventV1 structural schema', () => {
  it('accepts exactly the approved trigger variants', () => {
    expect(TRIGGER_TYPES).toEqual([
      'GAME_START', 'COLLISION', 'CLICK', 'KEY_PRESS', 'TIMER',
      'DIALOGUE_END', 'CHOICE_SELECTED',
    ]);
    const triggers = [
      { type: 'GAME_START' },
      { type: 'COLLISION', firstObjectId: ids.object, secondObjectId: ids.object },
      { type: 'CLICK', objectId: ids.object },
      { type: 'KEY_PRESS', key: 'ArrowLeft', repeat: false },
      { type: 'TIMER', delayMs: 100, repeat: true, intervalMs: 500 },
      { type: 'DIALOGUE_END', objectId: ids.object, componentId: ids.dialogue },
      { type: 'CHOICE_SELECTED', objectId: ids.object, componentId: ids.dialogue, choiceId: ids.choice },
    ];
    for (const trigger of triggers) {
      expect(GameEventV1.safeParse(event({ trigger })).success, trigger.type).toBe(true);
    }
    expect(GameEventV1.safeParse(event({ trigger: { type: 'CUSTOM', javascript: 'run()' } })).success).toBe(false);
  });

  it('accepts exactly the approved action variants with stable versioned IDs', () => {
    expect(ACTION_TYPES).toEqual([
      'CHANGE_SCENE', 'MOVE_OBJECT', 'CREATE_OBJECT', 'DESTROY_OBJECT',
      'PLAY_ANIMATION', 'PLAY_AUDIO', 'CHANGE_VARIABLE', 'ADD_SCORE',
      'CHANGE_HEALTH', 'SHOW_DIALOGUE',
    ]);
    const actions = [
      { type: 'CHANGE_SCENE', sceneId: ids.secondScene },
      { type: 'MOVE_OBJECT', objectId: ids.object, x: 10, y: -5 },
      { type: 'CREATE_OBJECT', prefabId: ids.prefab, sceneId: ids.scene, x: 1, y: 2 },
      { type: 'DESTROY_OBJECT', objectId: ids.object },
      { type: 'PLAY_ANIMATION', objectId: ids.object, componentId: ids.component, clip: 'walk' },
      { type: 'PLAY_AUDIO', assetId: ids.asset },
      { type: 'CHANGE_VARIABLE', variable: { scope: 'GLOBAL', variableId: ids.variable }, value: 2 },
      { type: 'ADD_SCORE', amount: 10 },
      { type: 'CHANGE_HEALTH', objectId: ids.object, componentId: ids.health, amount: -5 },
      { type: 'SHOW_DIALOGUE', objectId: ids.object, componentId: ids.dialogue },
    ];
    actions.forEach((action, index) => {
      expect(GameEventV1.safeParse(event({
        actions: [{ id: id(String(20 + index).padStart(4, '0')), version: 1, ...action }],
      })).success, action.type).toBe(true);
    });
    expect(GameEventV1.safeParse(event({ actions: [] })).success).toBe(false);
    expect(GameEventV1.safeParse(event({
      actions: [{ id: 'not-a-uuid', version: 1, type: 'ADD_SCORE', amount: 1 }],
    })).success).toBe(false);
  });

  it('requires stable versioned IDs on every condition node', () => {
    expect(CONDITION_TYPES).toEqual(['ALL', 'ANY', 'NOT', 'COMPARE_VARIABLE', 'OBJECT_EXISTS', 'HAS_COMPONENT']);
    const condition = {
      id: ids.condition,
      version: 1,
      type: 'ALL',
      conditions: [
        { id: id('0030'), version: 1, type: 'OBJECT_EXISTS', objectId: ids.object },
        {
          id: id('0031'), version: 1, type: 'NOT',
          condition: { id: id('0032'), version: 1, type: 'HAS_COMPONENT', objectId: ids.object, componentId: ids.component },
        },
      ],
    };
    expect(GameEventV1.safeParse(event({ condition })).success).toBe(true);
    expect(GameEventV1.safeParse(event({
      condition: { ...condition, conditions: [{ version: 1, type: 'OBJECT_EXISTS', objectId: ids.object }] },
    })).success).toBe(false);
  });

  it('enforces condition depth and child count limits', () => {
    let atDepthLimit: unknown = { id: id('0040'), version: 1, type: 'OBJECT_EXISTS', objectId: ids.object };
    for (let depth = 1; depth < EVENT_LIMITS.conditionDepth; depth += 1) {
      atDepthLimit = { id: id(String(40 + depth).padStart(4, '0')), version: 1, type: 'NOT', condition: atDepthLimit };
    }
    expect(GameEventV1.safeParse(event({ condition: atDepthLimit })).success).toBe(true);
    const tooDeep = { id: id('0048'), version: 1, type: 'NOT', condition: atDepthLimit };
    expect(GameEventV1.safeParse(event({ condition: tooDeep })).success).toBe(false);

    const childrenAtLimit = Array.from({ length: EVENT_LIMITS.conditionChildren }, (_, index) => ({
      id: id(String(100 + index).padStart(4, '0')),
      version: 1,
      type: 'OBJECT_EXISTS',
      objectId: ids.object,
    }));
    expect(GameEventV1.safeParse(event({
      condition: { id: ids.condition, version: 1, type: 'ANY', conditions: childrenAtLimit },
    })).success).toBe(true);
    expect(GameEventV1.safeParse(event({
      condition: {
        id: ids.condition,
        version: 1,
        type: 'ANY',
        conditions: [...childrenAtLimit, { id: id('0132'), version: 1, type: 'OBJECT_EXISTS', objectId: ids.object }],
      },
    })).success).toBe(false);
  });

  it('enforces action and project event count limits at their exact boundaries', () => {
    const actions = Array.from({ length: EVENT_LIMITS.actions }, (_, index) => ({
      id: id((0x0200 + index).toString(16).padStart(4, '0')),
      version: 1,
      type: 'ADD_SCORE',
      amount: index,
    }));
    expect(GameEventV1.safeParse(event({ actions })).success).toBe(true);
    expect(GameEventV1.safeParse(event({
      actions: [...actions, { id: id('0264'), version: 1, type: 'ADD_SCORE', amount: 1 }],
    })).success).toBe(false);

    const events = Array.from({ length: EVENT_LIMITS.events }, (_, index) => event({
      id: id((0x1000 + index).toString(16).padStart(4, '0')),
      actions: [{ id: id((0x2000 + index).toString(16).padStart(4, '0')), version: 1, type: 'ADD_SCORE', amount: 1 }],
    }));
    expect(EngineProjectV1.safeParse(project(events)).success).toBe(true);
    expect(EngineProjectV1.safeParse(project([...events, event({
      id: id('3000'),
      actions: [{ id: id('3001'), version: 1, type: 'ADD_SCORE', amount: 1 }],
    })])).success).toBe(false);
  });

  it('normalizes stable IDs nested inside conditions', () => {
    const parsed = GameEventV1.parse(event({
      condition: {
        id: ids.condition.toUpperCase(),
        version: 1,
        type: 'OBJECT_EXISTS',
        objectId: ids.object.toUpperCase(),
      },
    }));
    expect(parsed.condition).toEqual({
      id: ids.condition,
      version: 1,
      type: 'OBJECT_EXISTS',
      objectId: ids.object,
    });
  });

  it('rejects executable and vendor graph fields at every canonical boundary', () => {
    expect(GameEventV1.safeParse({ ...event(), javascript: 'alert(1)' }).success).toBe(false);
    expect(GameEventV1.safeParse(event({ trigger: { type: 'GAME_START', handler: () => undefined } })).success).toBe(false);
    expect(GameEventV1.safeParse(event({
      actions: [{ id: ids.action, version: 1, type: 'ADD_SCORE', amount: 1, code: 'score++' }],
    })).success).toBe(false);
    expect(GameEventV1.safeParse(event({
      condition: { id: ids.condition, version: 1, type: 'OBJECT_EXISTS', objectId: ids.object, position: { x: 0, y: 0 } },
    })).success).toBe(false);
    expect(EngineProjectV1.safeParse({ ...project(), reactFlow: { nodes: [], edges: [] } }).success).toBe(false);
  });

  it('returns a diagnostic for cyclic condition input instead of throwing', () => {
    const cyclic: Record<string, unknown> = {
      id: ids.condition,
      version: 1,
      type: 'NOT',
    };
    cyclic.condition = cyclic;
    expect(() => GameEventV1.safeParse(event({ condition: cyclic }))).not.toThrow();
    const result = GameEventV1.safeParse(event({ condition: cyclic }));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.some((issue) => issue.message.includes('cycle'))).toBe(true);

    expect(() => readEngineProject(project([event({ condition: cyclic })]))).not.toThrow();
    const projectResult = readEngineProject(project([event({ condition: cyclic })]));
    expect(projectResult.status).toBe('INVALID');
    if (projectResult.status === 'INVALID') {
      expect(projectResult.diagnostics.some((message) => message.includes('cycle'))).toBe(true);
    }
  });
});

describe('event semantic validation inside EngineProjectV1', () => {
  it.each([
    ['scene', { type: 'CHANGE_SCENE', sceneId: id('0900') }],
    ['object', { type: 'DESTROY_OBJECT', objectId: id('0901') }],
    ['component', { type: 'SHOW_DIALOGUE', objectId: ids.object, componentId: id('0902') }],
    ['prefab', { type: 'CREATE_OBJECT', prefabId: id('0903'), sceneId: ids.scene, x: 0, y: 0 }],
    ['asset', { type: 'PLAY_AUDIO', assetId: id('0904') }],
  ])('rejects a missing typed %s action target', (_kind, action) => {
    expect(EngineProjectV1.safeParse(project([event({
      actions: [{ id: ids.action, version: 1, ...action }],
    })])).success).toBe(false);
  });

  it.each([
    ['collision object', { trigger: { type: 'COLLISION', firstObjectId: ids.object, secondObjectId: id('0910') } }],
    ['clicked object', { trigger: { type: 'CLICK', objectId: id('0911') } }],
    ['condition object', { condition: { id: ids.condition, version: 1, type: 'OBJECT_EXISTS', objectId: id('0912') } }],
    ['condition component', { condition: { id: ids.condition, version: 1, type: 'HAS_COMPONENT', objectId: ids.object, componentId: id('0913') } }],
  ])('rejects a missing typed %s reference', (_kind, overrides) => {
    expect(EngineProjectV1.safeParse(project([event(overrides)])).success).toBe(false);
  });

  it('rejects incompatible component types and dialogue choices', () => {
    const badTriggers = [
      { type: 'DIALOGUE_END', objectId: ids.object, componentId: ids.component },
      { type: 'CHOICE_SELECTED', objectId: ids.object, componentId: ids.dialogue, choiceId: id('0905') },
    ];
    for (const trigger of badTriggers) {
      expect(EngineProjectV1.safeParse(project([event({ trigger })])).success).toBe(false);
    }
    expect(EngineProjectV1.safeParse(project([event({
      actions: [{ id: ids.action, version: 1, type: 'CHANGE_HEALTH', objectId: ids.object, componentId: ids.component, amount: -1 }],
    })])).success).toBe(false);
    expect(EngineProjectV1.safeParse(project([event({
      actions: [{ id: ids.action, version: 1, type: 'PLAY_ANIMATION', objectId: ids.object, componentId: ids.component, clip: 'walk' }],
    })])).success).toBe(false);
  });

  it('rejects unknown variable scopes and value-type mismatches', () => {
    const actions = [
      { variable: { scope: 'GLOBAL', variableId: ids.sceneVariable }, value: true },
      { variable: { scope: 'SCENE', sceneId: ids.scene, variableId: ids.sceneVariable }, value: 1 },
      { variable: { scope: 'SCENE', sceneId: ids.secondScene, variableId: ids.sceneVariable }, value: false },
    ];
    for (const action of actions) {
      expect(EngineProjectV1.safeParse(project([event({
        actions: [{ id: ids.action, version: 1, type: 'CHANGE_VARIABLE', ...action }],
      })])).success).toBe(false);
    }
    expect(EngineProjectV1.safeParse(project([event({
      condition: {
        id: ids.condition,
        version: 1,
        type: 'COMPARE_VARIABLE',
        variable: { scope: 'GLOBAL', variableId: ids.variable },
        operator: 'EQUALS',
        value: false,
      },
    })])).success).toBe(false);
  });

  it('accepts typed variable comparisons and reports duplicate nested IDs', () => {
    const condition = {
      id: ids.condition,
      version: 1,
      type: 'COMPARE_VARIABLE',
      variable: { scope: 'GLOBAL', variableId: ids.variable },
      operator: 'GREATER_THAN',
      value: 0,
    };
    expect(EngineProjectV1.safeParse(project([event({ condition })])).success).toBe(true);
    expect(EngineProjectV1.safeParse(project([
      event({ condition, actions: [{ id: ids.condition, version: 1, type: 'ADD_SCORE', amount: 1 }] }),
    ])).success).toBe(false);
  });

  it('rejects event node IDs that collide with stable dialogue choice IDs', () => {
    expect(EngineProjectV1.safeParse(project([event({ id: ids.choice })])).success).toBe(false);
  });

  it('round-trips only canonical engine data with no React Flow or runtime state', () => {
    const value = project([event()]);
    const parsed = EngineProjectV1.parse(value);
    expect(JSON.parse(JSON.stringify(parsed))).toEqual(value);
    const serialized = JSON.stringify(parsed);
    expect(serialized).not.toContain('reactFlow');
    expect(serialized).not.toContain('positionAbsolute');
    expect(serialized).not.toContain('runtimeHandler');
    expect(readEngineProject(parsed)).toMatchObject({ status: 'SUPPORTED' });
  });
});
