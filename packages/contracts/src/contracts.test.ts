import { describe, expect, it } from 'vitest';
import {
  CompleteGameVersionInput,
  CreateDonationInput,
  CreateGameInput,
  CreateGameVersionInput,
  PublishGameInput,
  RegisterInput,
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

  it('accepts a sandbox donation of at least 100 cents', () => {
    expect(
      CreateDonationInput.parse({
        amountCents: 500,
        idempotencyKey: 'donate-key-1',
      }),
    ).toEqual({ amountCents: 500, idempotencyKey: 'donate-key-1' });
  });

  it('rejects a donation below one dollar', () => {
    expect(() =>
      CreateDonationInput.parse({
        amountCents: 99,
        idempotencyKey: 'donate-key-1',
      }),
    ).toThrow();
  });
});
