import { z } from 'zod';
import { EngineProjectV1 } from '../project-schema.js';
import {
  createLegacyIdentityAllocator,
  stableStringify,
  type LegacyAdapterResult,
} from './identity.js';

const StoryV0 = z.object({
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
    }).strict()).max(12),
  }).strict()).min(1).max(100),
}).strict().superRefine((story, context) => {
  const sceneIds = new Set<string>();
  story.scenes.forEach((scene, index) => {
    if (sceneIds.has(scene.id)) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Scene identifiers must be unique', path: ['scenes', index, 'id'] });
    sceneIds.add(scene.id);
  });
  if (!sceneIds.has(story.startSceneId)) context.addIssue({ code: z.ZodIssueCode.custom, message: 'The start scene must exist', path: ['startSceneId'] });
  story.scenes.forEach((scene, sceneIndex) => scene.choices.forEach((choice, choiceIndex) => {
    if (!sceneIds.has(choice.targetSceneId)) context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Choice targetSceneId must reference an existing scene',
      path: ['scenes', sceneIndex, 'choices', choiceIndex, 'targetSceneId'],
    });
  }));
});

function diagnostics(error: z.ZodError) {
  return error.issues.map((issue) => `${issue.path.join('.') || 'source'}: ${issue.message}`);
}

export function adaptStoryV0(gameId: string, raw: unknown): LegacyAdapterResult {
  const parsed = StoryV0.safeParse(raw);
  if (!parsed.success) return { status: 'INVALID_LEGACY', raw, diagnostics: diagnostics(parsed.error) };
  const source = parsed.data;
  const ids = createLegacyIdentityAllocator(gameId);
  const projectId = ids.role('project', gameId, 'canonical-project');
  const sceneIds = new Map(source.scenes.map((scene) => [scene.id, ids.immutable('scene', projectId, scene.id)]));
  const events: Array<Record<string, unknown>> = [];

  const scenes = source.scenes.map((scene, sceneIndex) => {
    const sceneId = sceneIds.get(scene.id)!;
    const objectId = ids.role('object', sceneId, 'dialogue');
    const componentId = ids.role('component', objectId, 'dialogue');
    const seenChoices = new Map<string, number>();
    const choices = scene.choices.map((choice) => {
      const fingerprintSource = { targetSceneId: choice.targetSceneId, text: choice.text };
      const fingerprint = stableStringify(fingerprintSource);
      const duplicateIndex = seenChoices.get(fingerprint) ?? 0;
      seenChoices.set(fingerprint, duplicateIndex + 1);
      const choiceId = ids.content('dialogue-choice', componentId, fingerprintSource, duplicateIndex);
      const eventId = ids.role('event', choiceId, 'choice-selected');
      const actionId = ids.role('action', eventId, 'change-scene');
      events.push({
        id: eventId,
        version: 1,
        name: `Choice: ${choice.text}`.slice(0, 120),
        enabled: true,
        order: events.length,
        trigger: { type: 'CHOICE_SELECTED', objectId, componentId, choiceId },
        condition: null,
        actions: [{ id: actionId, version: 1, type: 'CHANGE_SCENE', sceneId: sceneIds.get(choice.targetSceneId)! }],
      });
      return { id: choiceId, text: choice.text };
    });
    return {
      id: sceneId,
      name: scene.id,
      order: sceneIndex,
      backgroundColor: scene.backgroundColor,
      objects: [{
        id: objectId,
        parentId: null,
        name: scene.speaker || 'Narrator',
        enabled: true,
        order: 0,
        components: [{
          id: componentId,
          type: 'Dialogue',
          version: 1,
          properties: { speaker: scene.speaker, text: scene.dialogue, choices },
        }],
      }],
    };
  });

  const canonical = {
    schemaVersion: 1,
    projectId,
    engineFamily: 'TFG_ENGINE',
    entrySceneId: sceneIds.get(source.startSceneId)!,
    settings: { viewport: { width: 1280, height: 720 } },
    assetIds: [],
    scenes,
    variables: { global: [], player: [], scene: {} },
    events,
    prefabs: [],
  };
  const result = EngineProjectV1.safeParse(canonical);
  if (!result.success) return { status: 'INVALID_LEGACY', raw, diagnostics: diagnostics(result.error) };
  return { status: 'CONVERTED', project: result.data, canonicalJson: `${JSON.stringify(result.data, null, 2)}\n` };
}
