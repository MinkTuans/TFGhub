import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  EngineProjectV1,
  LEGACY_ID_NAMESPACE,
  adaptLegacyProject,
  readEngineProject,
  uuidV5,
} from '../index.js';

const gameId = 'legacy-game-42';

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`fixtures/${name}`, import.meta.url), 'utf8'));
}

function golden(name: string): string {
  return readFileSync(new URL(`fixtures/${name}`, import.meta.url), 'utf8');
}

function converted(source: unknown, id = gameId) {
  const result = adaptLegacyProject(id, source);
  expect(result.status).toBe('CONVERTED');
  if (result.status !== 'CONVERTED') throw new Error(result.diagnostics.join('; '));
  return result;
}

describe('deterministic UUIDv5 identity', () => {
  it('matches the RFC 4122 UUIDv5 golden vector', () => {
    expect(uuidV5('www.widgets.com', '6ba7b810-9dad-11d1-80b4-00c04fd430c8'))
      .toBe('21f7f8de-8051-5b89-8680-0195ef798b6a');
  });

  it('freezes the permanent TFG legacy namespace UUID', () => {
    expect(LEGACY_ID_NAMESPACE).toBe('01435a7b-8ad1-52aa-93b6-d65b53dccfc2');
  });

  it('does not call randomUUID while adapting legacy data', () => {
    const randomUUID = vi.spyOn(globalThis.crypto, 'randomUUID');
    converted(fixture('story-v0.json'));
    expect(randomUUID).not.toHaveBeenCalled();
    randomUUID.mockRestore();
  });
});

describe('STORY v0 adapter', () => {
  it('matches the reviewed canonical golden file byte-for-byte', () => {
    const result = converted(fixture('story-v0.json'));
    expect(result.canonicalJson).toBe(golden('story-v1.golden.json'));
    expect(`${JSON.stringify(result.project, null, 2)}\n`).toBe(result.canonicalJson);
    expect(EngineProjectV1.parse(result.project)).toEqual(result.project);
    expect(readEngineProject(result.project)).toMatchObject({ status: 'SUPPORTED' });
    expect(result.project.scenes.map((scene) => scene.backgroundColor)).toEqual(['#102030', '#204020']);
  });

  it('is byte-stable across repeated conversions and game-scoped', () => {
    const source = fixture('story-v0.json');
    const first = converted(source);
    const second = converted(structuredClone(source));
    const anotherGame = converted(source, 'legacy-game-43');
    expect(second.canonicalJson).toBe(first.canonicalJson);
    expect(anotherGame.project.projectId).not.toBe(first.project.projectId);
    expect(anotherGame.project.scenes.map((scene) => scene.id))
      .not.toEqual(first.project.scenes.map((scene) => scene.id));
  });

  it('maps every choice to stable choice, event, and action IDs without collisions', () => {
    const result = converted(fixture('story-v0.json'));
    const choices = result.project.scenes.flatMap((scene) => scene.objects.flatMap((object) =>
      object.components.filter((component) => component.type === 'Dialogue').flatMap((component) =>
        (component.properties as { choices: Array<{ id: string }> }).choices),
    ));
    expect(choices).toHaveLength(2);
    expect(result.project.events).toHaveLength(2);
    expect(result.project.events.map((event) => event.trigger.type)).toEqual([
      'CHOICE_SELECTED',
      'CHOICE_SELECTED',
    ]);

    const ids = new Set<string>();
    const register = (value: string) => {
      expect(ids.has(value)).toBe(false);
      ids.add(value);
    };
    register(result.project.projectId);
    result.project.scenes.forEach((scene) => {
      register(scene.id);
      scene.objects.forEach((object) => {
        register(object.id);
        object.components.forEach((component) => {
          register(component.id);
          if (component.type === 'Dialogue') {
            (component.properties as { choices: Array<{ id: string }> }).choices.forEach((choice) => register(choice.id));
          }
        });
      });
    });
    result.project.events.forEach((event) => {
      register(event.id);
      event.actions.forEach((action) => register(action.id));
    });
  });

  it('keeps IDs attached to immutable scene IDs and choice content across reorder', () => {
    const source = fixture('story-v0.json') as {
      sourceType: 'STORY';
      startSceneId: string;
      scenes: Array<{ id: string; choices: Array<{ text: string; targetSceneId: string }> }>;
    };
    const original = converted(source).project;
    const reorderedSource = structuredClone(source);
    reorderedSource.scenes.reverse();
    reorderedSource.scenes.forEach((scene) => scene.choices.reverse());
    const reordered = converted(reorderedSource).project;

    const sceneIds = (project: typeof original) => Object.fromEntries(project.scenes.map((scene) => [scene.name, scene.id]));
    const choices = (project: typeof original) => Object.fromEntries(project.events.map((event) => {
      if (event.trigger.type !== 'CHOICE_SELECTED') throw new Error('Expected a choice event');
      const action = event.actions[0];
      if (action?.type !== 'CHANGE_SCENE') throw new Error('Expected a scene-change action');
      const key = JSON.stringify([event.name, action.sceneId]);
      return [key, { choiceId: event.trigger.choiceId, eventId: event.id, actionId: action.id }];
    }));
    expect(sceneIds(reordered)).toEqual(sceneIds(original));
    expect(choices(reordered)).toEqual(choices(original));
    expect(readEngineProject(original)).toMatchObject({ status: 'SUPPORTED', project: original });
  });

  it('uses parent scope and duplicate ordinal only when choice content is identical', () => {
    const source = fixture('story-v0.json') as {
      scenes: Array<{ id: string; speaker: string; dialogue: string; backgroundColor: string; choices: Array<{ text: string; targetSceneId: string }> }>;
    };
    const duplicate = structuredClone(source.scenes[0]!.choices[0]!);
    source.scenes[0]!.choices.push(duplicate);
    source.scenes[1]!.choices.push(structuredClone(duplicate));
    const result = converted(source).project;
    const dialogueChoices = result.scenes.map((scene) => (
      scene.objects[0]!.components[0]!.properties as { choices: Array<{ id: string }> }
    ).choices.map((choice) => choice.id));
    expect(new Set(dialogueChoices.flat()).size).toBe(4);
    expect(dialogueChoices[0]![0]).not.toBe(dialogueChoices[0]![1]);
    expect(dialogueChoices[0]![0]).not.toBe(dialogueChoices[1]![0]);

    const identitySource = fixture('story-v0.json') as typeof source;
    identitySource.scenes[0]!.choices = [];
    identitySource.scenes[1] = { ...structuredClone(identitySource.scenes[0]!), id: 'forest' };
    const sameContent = converted(identitySource).project;
    expect(sameContent.scenes[0]!.id).not.toBe(sameContent.scenes[1]!.id);
  });

  it('returns diagnostics and the untouched raw source for dangling references', () => {
    const source = fixture('story-v0.json') as Record<string, unknown> & {
      scenes: Array<{ choices: Array<{ targetSceneId: string }> }>;
    };
    source.scenes[0]!.choices[0]!.targetSceneId = 'missing';
    const result = adaptLegacyProject(gameId, source);
    expect(result).toMatchObject({ status: 'INVALID_LEGACY', raw: source });
    expect(result.raw).toBe(source);
    expect(result.diagnostics.some((message) => message.includes('targetSceneId'))).toBe(true);
  });
});

describe('PLATFORMER v0 adapter', () => {
  it('matches the reviewed canonical golden file and maps player, goal, and platforms', () => {
    const result = converted(fixture('platformer-v0.json'));
    expect(result.canonicalJson).toBe(golden('platformer-v1.golden.json'));
    expect(result.project.scenes[0]?.objects.map((object) => object.name)).toEqual([
      'Player',
      'Goal',
      'Platform 1',
      'Platform 2',
    ]);
    expect(result.project.scenes[0]?.backgroundColor).toBe('#101820');
    const shapes = result.project.scenes[0]?.objects.map((object) => object.components.find((component) => component.type === 'Shape')?.properties);
    expect(shapes).toEqual([
      { kind: 'RECTANGLE', width: 24, height: 24, color: '#2563eb' },
      { kind: 'RECTANGLE', width: 24, height: 24, color: '#16a34a' },
      { kind: 'RECTANGLE', width: 640, height: 40, color: '#6b7280' },
      { kind: 'RECTANGLE', width: 160, height: 24, color: '#94a3b8' },
    ]);
    expect(result.project.events).toHaveLength(1);
    expect(result.project.events[0]).toMatchObject({
      trigger: { type: 'COLLISION' },
      actions: [{ type: 'COMPLETE_GAME' }],
    });
    expect(EngineProjectV1.safeParse(result.project).success).toBe(true);
    expect(readEngineProject(result.project)).toMatchObject({ status: 'SUPPORTED', project: result.project });
  });

  it('uses duplicate ordinals only for identical platforms', () => {
    const source = fixture('platformer-v0.json') as { platforms: Array<Record<string, unknown>> };
    source.platforms.push(structuredClone(source.platforms[0]!));
    const objects = converted(source).project.scenes[0]!.objects.filter((object) => object.name.startsWith('Platform'));
    expect(objects).toHaveLength(3);
    expect(new Set(objects.map((object) => object.id)).size).toBe(3);
  });

  it('keeps player, goal, and non-identical platform IDs stable across reorder', () => {
    const source = fixture('platformer-v0.json') as {
      sourceType: 'PLATFORMER';
      platforms: Array<Record<string, unknown>>;
    };
    const original = converted(source).project.scenes[0]!.objects;
    const reorderedSource = structuredClone(source);
    reorderedSource.platforms.reverse();
    const reordered = converted(reorderedSource).project.scenes[0]!.objects;
    const byName = (objects: typeof original) => Object.fromEntries(objects.map((object) => [
      object.name.startsWith('Platform')
        ? JSON.stringify((object.components[0]!.properties as { x: number; y: number }))
        : object.name,
      object.id,
    ]));
    expect(byName(reordered)).toEqual(byName(original));
  });

  it('returns diagnostics rather than repairing invalid geometry', () => {
    const source = fixture('platformer-v0.json') as Record<string, unknown> & {
      platforms: Array<{ width: number }>;
    };
    source.platforms[0]!.width = 10_000;
    const result = adaptLegacyProject(gameId, source);
    expect(result).toMatchObject({ status: 'INVALID_LEGACY', raw: source });
    expect(result.raw).toBe(source);
    expect(result.diagnostics.some((message) => message.includes('platforms.0'))).toBe(true);
  });
});

describe('unsupported legacy lanes', () => {
  it.each(['CODE', 'UPLOAD'] as const)('rejects %s explicitly without touching the source', (sourceType) => {
    const source = { sourceType, payload: 'preserve me' };
    const result = adaptLegacyProject(gameId, source);
    expect(result).toEqual({
      status: 'UNSUPPORTED_SOURCE_TYPE',
      sourceType,
      raw: source,
      diagnostics: [`${sourceType} legacy projects are not supported by canonical adapters`],
    });
    expect(result.raw).toBe(source);
  });
});
