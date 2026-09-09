import { describe, expect, it } from 'vitest';
import * as contracts from './index';

const {
  CreateGameInput,
  GameSummary,
  PublicGameSummary,
  RegisterInput,
  UpdateGameInput,
} = contracts;

function requiredContract(name: string) {
  const schema = (contracts as Record<string, unknown>)[name];
  expect(schema).toBeDefined();
  return schema as {
    parse(value: unknown): unknown;
    safeParse(value: unknown): { success: boolean };
  };
}

function gameProjectInput() {
  const schema = (contracts as Record<string, unknown>).GameProjectInput;
  expect(schema).toBeDefined();
  return schema as { safeParse(value: unknown): { success: boolean } };
}

describe('contracts', () => {
  it('accepts supported and future-schema read-only engine project responses', () => {
    const response = requiredContract('EngineProjectReadResponse');
    const summary = {
      revisionNumber: 3,
      schemaVersion: 1,
      contentHash: 'a'.repeat(64),
      byteSize: 42,
      retention: 'STANDARD',
      createdAt: '2026-09-09T00:00:00.000Z',
    };

    expect(response.safeParse({
      status: 'SUPPORTED',
      project: { schemaVersion: 1 },
      revision: summary,
    }).success).toBe(true);
    expect(response.safeParse({
      status: 'READ_ONLY',
      reason: 'UNSUPPORTED_FUTURE_SCHEMA',
      raw: { schemaVersion: 2, untouched: true },
      schemaVersion: 2,
      diagnostics: [],
    }).success).toBe(true);
  });

  it('requires a nonnegative base revision and canonical document when saving', () => {
    const input = requiredContract('SaveEngineProjectInput');

    expect(input.safeParse({ baseRevision: 0, project: { schemaVersion: 1 } }).success).toBe(true);
    expect(input.safeParse({ baseRevision: -1, project: { schemaVersion: 1 } }).success).toBe(false);
    expect(input.safeParse({ baseRevision: 0 }).success).toBe(false);
  });

  it('defines the stable revision-conflict response', () => {
    const conflict = requiredContract('ProjectRevisionConflictResponse');

    expect(conflict.parse({
      statusCode: 409,
      code: 'PROJECT_REVISION_CONFLICT',
      currentRevision: 7,
    })).toEqual({
      statusCode: 409,
      code: 'PROJECT_REVISION_CONFLICT',
      currentRevision: 7,
    });
  });

  it('rejects malformed engine revision summaries', () => {
    const summary = requiredContract('EngineProjectRevisionSummary');

    expect(summary.safeParse({
      revisionNumber: 1,
      schemaVersion: 1,
      contentHash: 'not-a-sha256',
      byteSize: 10,
      retention: 'STANDARD',
      createdAt: '2026-09-09T00:00:00.000Z',
    }).success).toBe(false);
  });

  it('normalizes registration email', () => {
    expect(RegisterInput.parse({ email: ' DEV@EXAMPLE.COM ', password: 'password123' }).email)
      .toBe('dev@example.com');
  });

  it('rejects an invalid game slug', () => {
    expect(() => CreateGameInput.parse({ title: 'Demo', slug: 'Not Valid' })).toThrow();
  });

  it('requires the exact submitted revision for a moderation action', () => {
    expect(contracts.ReviewRevisionInput.safeParse({}).success).toBe(false);
    expect(contracts.ReviewRevisionInput.parse({
      artifactVersion: 2,
      submittedAt: '2026-09-07T09:00:00.000Z',
    })).toEqual({
      artifactVersion: 2,
      submittedAt: '2026-09-07T09:00:00.000Z',
    });
  });

  it.each(['UPLOAD', 'CODE', 'STORY', 'PLATFORMER', 'ENGINE'] as const)(
    'accepts %s as the selected game source type',
    (sourceType) => {
      expect(
        CreateGameInput.parse({ title: 'Demo', slug: 'demo', sourceType }),
      ).toMatchObject({ sourceType });
    },
  );

  it('keeps UPLOAD as the default source type', () => {
    expect(CreateGameInput.parse({ title: 'Demo', slug: 'demo' })).toMatchObject({
      sourceType: 'UPLOAD',
    });
  });

  it('rejects a story choice whose target scene does not exist', () => {
    expect(
      gameProjectInput().safeParse({
        sourceType: 'STORY',
        startSceneId: 'intro',
        scenes: [
          {
            id: 'intro',
            speaker: 'Guide',
            dialogue: 'Choose wisely.',
            backgroundColor: '#112233',
            choices: [{ text: 'Continue', targetSceneId: 'missing' }],
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('rejects platform geometry that extends outside the canvas', () => {
    expect(
      gameProjectInput().safeParse({
        sourceType: 'PLATFORMER',
        canvas: { width: 640, height: 480 },
        backgroundColor: '#101010',
        player: { x: 32, y: 32, color: '#ffffff' },
        goal: { x: 600, y: 400, color: '#00ff00' },
        platforms: [{ x: 600, y: 400, width: 41, height: 20, color: '#888888' }],
      }).success,
    ).toBe(false);
  });

  it.each([
    ['canvas', { width: 1921, height: 480 }, { x: 32, y: 32 }, { x: 600, y: 400 }],
    ['player', { width: 640, height: 480 }, { x: 640, y: 32 }, { x: 600, y: 400 }],
    ['goal', { width: 640, height: 480 }, { x: 32, y: 32 }, { x: 600, y: 480 }],
  ])('rejects a platformer %s outside its canvas', (_field, canvas, player, goal) => {
    expect(
      gameProjectInput().safeParse({
        sourceType: 'PLATFORMER',
        canvas,
        backgroundColor: '#101010',
        player: { ...player, color: '#ffffff' },
        goal: { ...goal, color: '#00ff00' },
        platforms: [{ x: 0, y: 440, width: 640, height: 40, color: '#888888' }],
      }).success,
    ).toBe(false);
  });

  it('bounds each code source field to 50,000 characters', () => {
    const schema = gameProjectInput();
    const withinLimit = 'a'.repeat(50_000);

    expect(
      schema.safeParse({
        sourceType: 'CODE',
        html: withinLimit,
        css: withinLimit,
        javascript: withinLimit,
      }).success,
    ).toBe(true);
    expect(
      schema.safeParse({
        sourceType: 'CODE',
        html: 'a'.repeat(50_001),
        css: '',
        javascript: '',
      }).success,
    ).toBe(false);
  });

  it('requires source, review, and artifact fields in a game summary', () => {
    const legacySummary = {
      id: 'game-1',
      slug: 'demo',
      title: 'Demo',
      description: '',
      visibility: 'DRAFT',
      accessMode: 'GUEST_ALLOWED',
      moderationState: 'CLEAR',
      createdAt: '2026-09-07T00:00:00.000Z',
      updatedAt: '2026-09-07T00:00:00.000Z',
    };

    expect(GameSummary.safeParse(legacySummary).success).toBe(false);
    expect(
      GameSummary.safeParse({
        ...legacySummary,
        sourceType: 'CODE',
        reviewState: 'PENDING',
        projectData: { sourceType: 'CODE', html: '', css: '', javascript: '' },
        artifactVersion: 2,
        artifactReady: true,
        coverVersion: 0,
        coverContentType: null,
        viewportWidth: 16,
        viewportHeight: 9,
        reviewNote: null,
        submittedAt: '2026-09-07T01:00:00.000Z',
        reviewedAt: null,
      }).success,
    ).toBe(true);
  });

  it('retains versioned cover metadata and viewport dimensions in game summaries', () => {
    const game = {
      id: 'game-1',
      slug: 'demo',
      title: 'Demo',
      description: '',
      visibility: 'DRAFT',
      accessMode: 'GUEST_ALLOWED',
      moderationState: 'CLEAR',
      sourceType: 'UPLOAD',
      reviewState: 'DRAFT',
      projectData: null,
      artifactVersion: 0,
      artifactReady: false,
      reviewNote: null,
      submittedAt: null,
      reviewedAt: null,
      createdAt: '2026-09-07T00:00:00.000Z',
      updatedAt: '2026-09-07T00:00:00.000Z',
    };

    expect(GameSummary.parse({
      ...game,
      coverVersion: 0,
      coverContentType: null,
      viewportWidth: 16,
      viewportHeight: 9,
    })).toMatchObject({
      coverVersion: 0,
      coverContentType: null,
      viewportWidth: 16,
      viewportHeight: 9,
    });
  });

  it('retains cover metadata and viewport dimensions in public game summaries', () => {
    const publicGame = {
      slug: 'demo',
      title: 'Demo',
      description: '',
      developer: { displayName: 'Developer' },
      createdAt: '2026-09-07T00:00:00.000Z',
      artifactVersion: 2,
      artifactReady: true,
    };

    expect(PublicGameSummary.parse({
      ...publicGame,
      coverVersion: 2,
      coverContentType: 'image/webp',
      viewportWidth: 16,
      viewportHeight: 9,
    })).toMatchObject({
      coverVersion: 2,
      coverContentType: 'image/webp',
      viewportWidth: 16,
      viewportHeight: 9,
    });
  });

  it('defaults and updates bounded viewport dimensions from form values', () => {
    expect(CreateGameInput.parse({ title: 'Demo', slug: 'demo' })).toMatchObject({
      viewportWidth: 16,
      viewportHeight: 9,
    });
    expect(UpdateGameInput.parse({ viewportWidth: '320' })).toMatchObject({
      viewportWidth: 320,
    });
    expect(UpdateGameInput.parse({ viewportHeight: '240' })).toMatchObject({
      viewportHeight: 240,
    });
  });
});
