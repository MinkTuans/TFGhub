import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import type { GameProjectDocument } from '@indieforge/contracts';
import { scanHtml5Zip } from './build-scanner.js';
import {
  compileHtml5Zip,
  compilePreviewHtml,
  phaser3StarterDocument,
} from './engine-compiler.js';

const starter: GameProjectDocument = phaser3StarterDocument();

describe('engine compiler', () => {
  it('builds a starter document with a bouncing player in the entry scene', () => {
    expect(starter.engine).toBe('phaser3');
    expect(starter.entryScene).toBe('Main');
    const scene = starter.scenes.find((item) => item.id === starter.entryScene);
    expect(scene?.objects.some((item) => item.id === 'player' && item.bounce)).toBe(
      true,
    );
  });

  const stub = { phaserSource: 'window.Phaser={Game:function(){},AUTO:1};' };

  it('packages Phaser, game.js, and a scanner-accepted zip', async () => {
    const archive = await compileHtml5Zip(starter, stub);
    const zip = await JSZip.loadAsync(archive);
    const index = await zip.file('index.html')?.async('string');
    const game = await zip.file('game.js')?.async('string');
    const phaser = await zip.file('phaser.min.js')?.async('string');
    expect(index).toContain('src="phaser.min.js"');
    expect(index).toContain('src="game.js"');
    expect(index?.indexOf('phaser.min.js') ?? -1).toBeLessThan(
      index?.indexOf('game.js') ?? 0,
    );
    expect(phaser).toContain('Phaser');
    expect(game).toContain('new Phaser.Game');
    expect(game).toContain('arcade');
    expect(game).toContain('"player"');
    expect(await scanHtml5Zip(archive)).toEqual({ ok: true });
  });

  it('transpiles main.ts into the published runtime', async () => {
    const archive = await compileHtml5Zip(
      {
        ...starter,
        scripts: { 'main.ts': 'function onCreate() { const n: number = 1; n; }' },
      },
      stub,
    );
    const zip = await JSZip.loadAsync(archive);
    const user = await zip.file('user.js')?.async('string');
    expect(user).toContain('function onCreate');
    expect(user).not.toContain(': number');
  });

  it('rejects imports in main.ts', () => {
    expect(() =>
      compilePreviewHtml(
        {
          ...starter,
          scripts: { 'main.ts': 'import fs from "fs";' },
        },
        stub,
      ),
    ).toThrow(/import/i);
  });

  it('inlines Phaser for a studio preview document', () => {
    const html = compilePreviewHtml(starter, stub);
    expect(html).toContain('new Phaser.Game');
    expect(html).not.toContain('src="game.js"');
    expect(html).toContain('#66c0f4');
    expect(html).toContain('keydown-');
    expect(html).toContain('"RIGHT"');
    expect(html).toContain('startFollow');
    expect(html).toContain('localStorage');
  });

  it('packages image assets and collision/audio hooks', async () => {
    const archive = await compileHtml5Zip(
      {
        ...starter,
        assets: [
          {
            id: 'hero-img',
            kind: 'image',
            name: 'hero.png',
            mime: 'image/png',
            dataBase64: Buffer.from('png').toString('base64'),
          },
          {
            id: 'blip',
            kind: 'audio',
            name: 'blip.wav',
            mime: 'audio/wav',
            dataBase64: Buffer.from('RIFF').toString('base64'),
          },
        ],
        events: [
          {
            id: 'bump',
            trigger: 'collision',
            a: 'player',
            b: 'floor',
            actions: [{ type: 'playSound', assetId: 'blip' }],
          },
        ],
        scenes: [
          {
            ...starter.scenes[0],
            objects: [
              ...starter.scenes[0].objects,
              {
                id: 'hero',
                type: 'sprite',
                x: 80,
                y: 80,
                width: 32,
                height: 32,
                assetId: 'hero-img',
                bounce: false,
                solid: false,
                frames: 1,
              },
            ],
          },
        ],
      },
      stub,
    );
    const zip = await JSZip.loadAsync(archive);
    expect(zip.file('assets/hero-img.png')).toBeTruthy();
    expect(zip.file('assets/blip.wav')).toBeTruthy();
    const game = await zip.file('game.js')?.async('string');
    expect(game).toContain('this.add.sprite');
    expect(game).toContain('playSound');
    expect(game).toContain('physics.add.collider');
    expect(await scanHtml5Zip(archive)).toEqual({ ok: true });
  });
});
