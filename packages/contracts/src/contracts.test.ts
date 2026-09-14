import { describe, expect, it } from 'vitest';
import {
  CompleteGameVersionInput,
  CreateDonationInput,
  CreateGameInput,
  CreateGameProjectInput,
  GameProjectDocument,
  PlayHeartbeatInput,
  CreateGameVersionInput,
  PublishGameInput,
  RegisterInput,
  RollbackGameInput,
  UpdateGameProjectInput,
} from './index';

describe('contracts', () => {
  it('normalizes registration email', () => {
    expect(RegisterInput.parse({ email: ' DEV@EXAMPLE.COM ', password: 'password123' }).email)
      .toBe('dev@example.com');
  });

  it('rejects an invalid game slug', () => {
    expect(() => CreateGameInput.parse({ title: 'Demo', slug: 'Not Valid' })).toThrow();
  });

  it('accepts a zip version upload request with a sha256 checksum', () => {
    expect(
      CreateGameVersionInput.parse({
        filename: 'orbit.zip',
        byteSize: 1024,
        checksumSha256: 'a'.repeat(64),
      }),
    ).toEqual({
      filename: 'orbit.zip',
      byteSize: 1024,
      checksumSha256: 'a'.repeat(64),
    });
  });

  it('rejects a non-zip version upload', () => {
    expect(() =>
      CreateGameVersionInput.parse({
        filename: 'orbit.exe',
        byteSize: 1024,
        checksumSha256: 'a'.repeat(64),
      }),
    ).toThrow();
  });

  it('requires a checksum to complete an upload', () => {
    expect(() => CompleteGameVersionInput.parse({})).toThrow();
    expect(
      CompleteGameVersionInput.parse({ checksumSha256: 'b'.repeat(64) }),
    ).toEqual({ checksumSha256: 'b'.repeat(64) });
  });

  it('requires a version id to publish', () => {
    expect(() => PublishGameInput.parse({})).toThrow();
    expect(PublishGameInput.parse({ versionId: 'ver-1' })).toEqual({
      versionId: 'ver-1',
    });
  });

  it('requires a version id to roll back', () => {
    expect(() => RollbackGameInput.parse({})).toThrow();
    expect(RollbackGameInput.parse({ versionId: 'ver-1' })).toEqual({
      versionId: 'ver-1',
    });
  });

  it('accepts a sandbox donation of at least 100 cents', () => {
    expect(
      CreateDonationInput.parse({
        amountCents: 500,
        idempotencyKey: 'donate-key-1',
      }),
    ).toEqual({ amountCents: 500, idempotencyKey: 'donate-key-1' });
  });

  it('accepts the Phaser 3 starter template id', () => {
    expect(CreateGameProjectInput.parse({ template: 'phaser3-starter' })).toEqual({
      template: 'phaser3-starter',
    });
  });

  it('rejects an unknown engine template', () => {
    expect(() => CreateGameProjectInput.parse({ template: 'unity' })).toThrow();
  });

  it('requires the entry scene to exist in the project document', () => {
    const objects = [
      {
        id: 'player',
        type: 'rectangle',
        x: 40,
        y: 40,
        width: 48,
        height: 48,
        color: '#66c0f4',
        bounce: true,
      },
    ];
    expect(() =>
      GameProjectDocument.parse({
        engine: 'phaser3',
        engineVersion: '3.80.1',
        formatVersion: '1',
        entryScene: 'Missing',
        scenes: [
          {
            id: 'Main',
            width: 800,
            height: 600,
            background: '#1b2838',
            objects,
          },
        ],
      }),
    ).toThrow();
    expect(
      UpdateGameProjectInput.parse({
        document: {
          engine: 'phaser3',
          engineVersion: '3.80.1',
          formatVersion: '1',
          entryScene: 'Main',
          scenes: [
            {
              id: 'Main',
              width: 800,
              height: 600,
              background: '#1b2838',
              objects,
            },
          ],
        },
      }).document.entryScene,
    ).toBe('Main');
    expect(
      UpdateGameProjectInput.parse({
        document: {
          engine: 'phaser3',
          engineVersion: '3.80.1',
          formatVersion: '1',
          entryScene: 'Main',
          scenes: [
            {
              id: 'Main',
              width: 800,
              height: 600,
              background: '#1b2838',
              objects,
            },
          ],
          scripts: { 'main.ts': 'function onCreate() {}' },
        },
      }).document.scripts['main.ts'],
    ).toBe('function onCreate() {}');
  });

  it('rejects TypeScript larger than 20KB', () => {
    expect(() =>
      GameProjectDocument.parse({
        engine: 'phaser3',
        engineVersion: '3.80.1',
        formatVersion: '1',
        entryScene: 'Main',
        scenes: [
          {
            id: 'Main',
            width: 800,
            height: 600,
            background: '#1b2838',
            objects: [
              {
                id: 'player',
                type: 'rectangle',
                x: 40,
                y: 40,
                width: 48,
                height: 48,
                color: '#66c0f4',
                bounce: true,
              },
            ],
          },
        ],
        scripts: { 'main.ts': 'x'.repeat(20001) },
      }),
    ).toThrow();
  });

  it('rejects a donation below one dollar', () => {
    expect(() =>
      CreateDonationInput.parse({
        amountCents: 99,
        idempotencyKey: 'donate-key-1',
      }),
    ).toThrow();
  });

  it('requires a heartbeat event id and timestamp', () => {
    expect(() => PlayHeartbeatInput.parse({ visible: true, active: true })).toThrow();
    expect(
      PlayHeartbeatInput.parse({
        eventId: 'heartbeat-1',
        visible: true,
        active: false,
        occurredAt: '2026-09-05T12:00:00.000Z',
      }),
    ).toMatchObject({ visible: true, active: false });
  });
});
