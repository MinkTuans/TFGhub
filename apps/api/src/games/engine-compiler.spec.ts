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

  it('packages index.html and game.js that a scanner will accept', async () => {
    const archive = await compileHtml5Zip(starter);
    const zip = await JSZip.loadAsync(archive);
    expect(zip.file('index.html')).toBeTruthy();
    const game = await zip.file('game.js')?.async('string');
    expect(game).toContain('"player"');
    expect(game).toContain(starter.entryScene);
    expect(await scanHtml5Zip(archive)).toEqual({ ok: true });
  });

  it('inlines the runtime for a studio preview document', () => {
    const html = compilePreviewHtml(starter);
    expect(html).toContain('requestAnimationFrame');
    expect(html).not.toContain('src="game.js"');
    expect(html).toContain('#66c0f4');
  });
});
