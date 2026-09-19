import { describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createPixelAdventure } from '@indieforge/engine-core';
import { EngineBuildService } from './engine-build.service.js';

function setup() {
  const project = createPixelAdventure(randomUUID(), randomUUID);
  const updatedAt = new Date('2026-09-16T12:00:00Z');
  const record = {
    ownerId: 'owner',
    sourceType: 'ENGINE',
    gameUpdatedAt: updatedAt,
    project: {
      headRevision: {
        id: 'revision',
        document: project,
        revisionNumber: 4,
        contentHash: 'hash',
      },
    },
  };
  const projects = { findGameProject: vi.fn(async () => record) };
  const assets = {
    read: vi.fn(async () => ({
      content: Buffer.from('owned-image'),
      contentType: 'image/png',
    })),
  };
  const records = {
    begin: vi.fn(async () => 'build'),
    finish: vi.fn(),
    fail: vi.fn(),
  };
  const service = new EngineBuildService(
    projects as never,
    assets as never,
    records as never,
  );
  return { project, updatedAt, record, projects, assets, records, service };
}
describe('ENGINE immutable artifact preparation', () => {
  it('compiles canonical head, copies declared owned assets and records revision provenance', async () => {
    const ctx = setup();
    const assetId = randomUUID();
    ctx.project.assetIds.push(assetId);
    const result = await ctx.service.prepare('game', 'owner', ctx.updatedAt);
    expect(ctx.records.begin).toHaveBeenCalledWith(
      'game',
      'owner',
      'revision',
      [assetId],
    );
    expect(ctx.assets.read).toHaveBeenCalledWith(
      'game',
      'owner',
      assetId,
      false,
    );
    expect(result.files[0].path).toBe('index.html');
    expect(result.files[0].content).toContain('<canvas');
    expect(result.files[0].content).toContain(`assets/${assetId}.png`);
    expect(result.revisionNumber).toBe(4);
    expect(result.files[1]).toMatchObject({
      path: `assets/${assetId}.png`,
      content: Buffer.from('owned-image'),
    });
  });
  it('rejects another owner and stale snapshots before creating a build', async () => {
    const ctx = setup();
    await expect(
      ctx.service.prepare('game', 'other', ctx.updatedAt),
    ).rejects.toThrow('own');
    await expect(
      ctx.service.prepare('game', 'owner', new Date(0)),
    ).rejects.toThrow('changed');
    expect(ctx.records.begin).not.toHaveBeenCalled();
  });
  it('fails closed on a missing or corrupt owned asset', async () => {
    const ctx = setup();
    ctx.project.assetIds.push(randomUUID());
    ctx.assets.read.mockRejectedValueOnce(new Error('hash mismatch'));
    await expect(
      ctx.service.prepare('game', 'owner', ctx.updatedAt),
    ).rejects.toThrow('hash mismatch');
    expect(ctx.records.fail).toHaveBeenCalledWith('build');
    expect(ctx.records.finish).not.toHaveBeenCalled();
  });
});
