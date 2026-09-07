import { describe, expect, it } from 'vitest';
import * as contracts from './index';

const { CreateGameInput, GameSummary, RegisterInput } = contracts;

function gameProjectInput() {
  const schema = (contracts as Record<string, unknown>).GameProjectInput;
  expect(schema).toBeDefined();
  return schema as { safeParse(value: unknown): { success: boolean } };
}

describe('contracts', () => {
  it('normalizes registration email', () => {
    expect(RegisterInput.parse({ email: ' DEV@EXAMPLE.COM ', password: 'password123' }).email)
      .toBe('dev@example.com');
  });

  it('rejects an invalid game slug', () => {
    expect(() => CreateGameInput.parse({ title: 'Demo', slug: 'Not Valid' })).toThrow();
  });

  it.each(['UPLOAD', 'CODE', 'STORY', 'PLATFORMER'] as const)(
    'retains %s as the selected game source type',
    (sourceType) => {
      expect(
        CreateGameInput.parse({ title: 'Demo', slug: 'demo', sourceType }),
      ).toMatchObject({ sourceType });
    },
  );

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
        reviewNote: null,
        submittedAt: '2026-09-07T01:00:00.000Z',
        reviewedAt: null,
      }).success,
    ).toBe(true);
  });
});
