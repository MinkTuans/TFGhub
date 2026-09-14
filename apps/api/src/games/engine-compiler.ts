import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import JSZip from 'jszip';
import ts from 'typescript';
import type { GameProjectDocument } from '@indieforge/contracts';

const require = createRequire(import.meta.url);

export class EngineCompileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EngineCompileError';
  }
}

export type CompileOptions = { phaserSource?: string };

export function phaser3StarterDocument(): GameProjectDocument {
  return {
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
            x: 376,
            y: 276,
            width: 48,
            height: 48,
            color: '#66c0f4',
            bounce: true,
          },
        ],
      },
    ],
    scripts: {
      'main.ts': `function onCreate(_objects: Record<string, unknown>) {
  // Arcade physics already bounces the player.
}

function onUpdate(_delta: number, _objects: Record<string, unknown>) {}
`,
    },
  };
}

function readPhaser(): string {
  return readFileSync(require.resolve('phaser/dist/phaser.min.js'), 'utf8');
}

function phaserSource(options?: CompileOptions): string {
  return options?.phaserSource ?? readPhaser();
}

export function transpileMain(source: string): string {
  if (/\bimport\b/.test(source)) {
    throw new EngineCompileError('main.ts cannot use import');
  }
  if (/\brequire\s*\(/.test(source)) {
    throw new EngineCompileError('main.ts cannot use require');
  }
  if (/\beval\s*\(/.test(source)) {
    throw new EngineCompileError('main.ts cannot use eval');
  }
  if (/\bnew\s+Function\b/.test(source)) {
    throw new EngineCompileError('main.ts cannot use Function');
  }
  if (/\bprocess\b/.test(source)) {
    throw new EngineCompileError('main.ts cannot use process');
  }
  const result = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2018,
      module: ts.ModuleKind.ES2015,
      strict: true,
    },
    reportDiagnostics: true,
    fileName: 'main.ts',
  });
  const first = result.diagnostics?.find(
    (item) => item.category === ts.DiagnosticCategory.Error,
  );
  if (first) {
    throw new EngineCompileError(
      ts.flattenDiagnosticMessageText(first.messageText, '\n'),
    );
  }
  return result.outputText;
}

function gameScript(document: GameProjectDocument): string {
  return `(() => {
  const project = ${JSON.stringify({
    engine: document.engine,
    engineVersion: document.engineVersion,
    formatVersion: document.formatVersion,
    entryScene: document.entryScene,
    scenes: document.scenes,
  })};
  const scene = project.scenes.find((item) => item.id === project.entryScene) || project.scenes[0];
  class MainScene extends Phaser.Scene {
    constructor() { super('Main'); }
    create() {
      this.cameras.main.setBackgroundColor(scene.background);
      this.physics.world.setBounds(0, 0, scene.width, scene.height);
      this.gameObjects = {};
      for (const obj of scene.objects) {
        const sprite = this.add.rectangle(
          obj.x + obj.width / 2,
          obj.y + obj.height / 2,
          obj.width,
          obj.height,
          Number.parseInt(obj.color.slice(1), 16),
        );
        this.physics.add.existing(sprite);
        sprite.body.setCollideWorldBounds(true);
        sprite.body.setBounce(1, 1);
        if (obj.bounce) sprite.body.setVelocity(140, 110);
        this.gameObjects[obj.id] = sprite;
      }
      if (typeof onCreate === 'function') onCreate(this.gameObjects);
    }
    update(_t, delta) {
      if (typeof onUpdate === 'function') onUpdate(delta, this.gameObjects);
    }
  }
  new Phaser.Game({
    type: Phaser.AUTO,
    width: scene.width,
    height: scene.height,
    backgroundColor: scene.background,
    physics: { default: 'arcade', arcade: { gravity: { y: 0 } } },
    scene: MainScene,
  });
})();`;
}

function indexHtml(tags: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>IndieForge</title>
  </head>
  <body>
    ${tags}
  </body>
</html>
`;
}

export function compilePreviewHtml(
  document: GameProjectDocument,
  options?: CompileOptions,
): string {
  const user = transpileMain(document.scripts['main.ts'] ?? '');
  return indexHtml(
    `<script>${phaserSource(options)}</script><script>${user}</script><script>${gameScript(document)}</script>`,
  );
}

export async function compileHtml5Zip(
  document: GameProjectDocument,
  options?: CompileOptions,
): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    'index.html',
    indexHtml(
      '<script src="phaser.min.js"></script><script src="user.js"></script><script src="game.js"></script>',
    ),
  );
  zip.file('phaser.min.js', phaserSource(options));
  zip.file('user.js', transpileMain(document.scripts['main.ts'] ?? ''));
  zip.file('game.js', gameScript(document));
  return Buffer.from(await zip.generateAsync({ type: 'uint8array' }));
}
