import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import JSZip from 'jszip';
import ts from 'typescript';
import type { EngineAsset, GameProjectDocument } from '@indieforge/contracts';

const require = createRequire(import.meta.url);

export class EngineCompileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EngineCompileError';
  }
}

export type CompileOptions = { phaserSource?: string };

const ASSET_EXT: Record<EngineAsset['mime'], string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'audio/mpeg': '.mp3',
  'audio/ogg': '.ogg',
  'audio/wav': '.wav',
};

export function phaser3StarterDocument(): GameProjectDocument {
  return {
    engine: 'phaser3',
    engineVersion: '3.80.1',
    formatVersion: '1',
    entryScene: 'Main',
    cameraFollow: 'player',
    localSave: true,
    assets: [],
    events: [
      {
        id: 'move-right',
        trigger: 'keydown',
        key: 'RIGHT',
        actions: [{ type: 'setVelocity', objectId: 'player', vx: 160, vy: 0 }],
      },
      {
        id: 'move-left',
        trigger: 'keydown',
        key: 'LEFT',
        actions: [{ type: 'setVelocity', objectId: 'player', vx: -160, vy: 0 }],
      },
    ],
    scenes: [
      {
        id: 'Main',
        width: 800,
        height: 600,
        background: '#1b2838',
        gravityY: 0,
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
            solid: false,
          },
          {
            id: 'floor',
            type: 'rectangle',
            x: 40,
            y: 520,
            width: 720,
            height: 32,
            color: '#2a475e',
            bounce: false,
            solid: true,
          },
        ],
      },
    ],
    scripts: {
      'main.ts': `function onCreate(_objects: Record<string, unknown>) {
  // Arcade physics and no-code events already run.
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

function compiledAssets(
  document: GameProjectDocument,
  mode: 'preview' | 'zip',
) {
  return document.assets.map((asset) => ({
    id: asset.id,
    kind: asset.kind,
    url:
      mode === 'preview'
        ? `data:${asset.mime};base64,${asset.dataBase64}`
        : `assets/${asset.id}${ASSET_EXT[asset.mime]}`,
  }));
}

function gameScript(
  document: GameProjectDocument,
  mode: 'preview' | 'zip',
): string {
  const payload = {
    engine: document.engine,
    engineVersion: document.engineVersion,
    formatVersion: document.formatVersion,
    entryScene: document.entryScene,
    cameraFollow: document.cameraFollow ?? '',
    localSave: document.localSave,
    scenes: document.scenes,
    events: document.events,
    assets: compiledAssets(document, mode),
  };
  return `(() => {
  const project = ${JSON.stringify(payload)};
  const scene = project.scenes.find((item) => item.id === project.entryScene) || project.scenes[0];
  const saveKey = 'indieforge:' + project.entryScene;
  class MainScene extends Phaser.Scene {
    constructor() { super('Main'); }
    preload() {
      for (const asset of project.assets) {
        if (asset.kind === 'image') this.load.image(asset.id, asset.url);
        if (asset.kind === 'audio') this.load.audio(asset.id, asset.url);
      }
    }
    create() {
      this.cameras.main.setBackgroundColor(scene.background);
      this.physics.world.setBounds(0, 0, scene.width, scene.height);
      this.physics.world.gravity.y = scene.gravityY || 0;
      this.gameObjects = {};
      for (const obj of scene.objects) {
        const cx = obj.x + obj.width / 2;
        const cy = obj.y + obj.height / 2;
        let sprite;
        if (obj.type === 'sprite') {
          sprite = this.add.sprite(cx, cy, obj.assetId);
          sprite.setDisplaySize(obj.width, obj.height);
          if (obj.frames > 1) {
            this.anims.create({
              key: obj.id + '-anim',
              frames: this.anims.generateFrameNumbers(obj.assetId, { start: 0, end: obj.frames - 1 }),
              frameRate: 8,
              repeat: -1,
            });
            sprite.play(obj.id + '-anim');
          }
        } else {
          sprite = this.add.rectangle(cx, cy, obj.width, obj.height, Number.parseInt(obj.color.slice(1), 16));
        }
        this.physics.add.existing(sprite, !!obj.solid);
        if (sprite.body && !obj.solid) {
          sprite.body.setCollideWorldBounds(true);
          sprite.body.setBounce(obj.bounce ? 1 : 0, obj.bounce ? 1 : 0);
          if (obj.bounce) sprite.body.setVelocity(140, 110);
        }
        this.gameObjects[obj.id] = sprite;
      }
      const runActions = (event) => {
        for (const action of event.actions) {
          if (action.type === 'setVelocity' && this.gameObjects[action.objectId]?.body?.setVelocity) {
            this.gameObjects[action.objectId].body.setVelocity(action.vx || 0, action.vy || 0);
          }
          if (action.type === 'playSound' && action.assetId) this.sound.play(action.assetId);
          if (action.type === 'cameraFollow' && this.gameObjects[action.objectId]) {
            this.cameras.main.startFollow(this.gameObjects[action.objectId]);
          }
          if (action.type === 'save') {
            const snapshot = {};
            for (const id of Object.keys(this.gameObjects)) {
              snapshot[id] = { x: this.gameObjects[id].x, y: this.gameObjects[id].y };
            }
            localStorage.setItem(saveKey, JSON.stringify(snapshot));
          }
          if (action.type === 'load') {
            try {
              const snapshot = JSON.parse(localStorage.getItem(saveKey) || '{}');
              for (const id of Object.keys(snapshot)) {
                if (this.gameObjects[id]) {
                  this.gameObjects[id].x = snapshot[id].x;
                  this.gameObjects[id].y = snapshot[id].y;
                }
              }
            } catch (error) {}
          }
        }
      };
      for (const event of project.events) {
        if (event.trigger === 'create') runActions(event);
        if (event.trigger === 'keydown' && event.key) {
          this.input.keyboard.on('keydown-' + event.key, () => runActions(event));
        }
        if (event.trigger === 'collision' && this.gameObjects[event.a] && this.gameObjects[event.b]) {
          this.physics.add.collider(this.gameObjects[event.a], this.gameObjects[event.b], () => runActions(event));
        }
      }
      for (const obj of scene.objects) {
        if (!obj.solid) continue;
        for (const other of scene.objects) {
          if (other.id === obj.id || other.solid) continue;
          this.physics.add.collider(this.gameObjects[obj.id], this.gameObjects[other.id]);
        }
      }
      if (project.cameraFollow && this.gameObjects[project.cameraFollow]) {
        this.cameras.main.startFollow(this.gameObjects[project.cameraFollow]);
      }
      if (project.localSave) {
        try {
          const snapshot = JSON.parse(localStorage.getItem(saveKey) || 'null');
          if (snapshot) {
            for (const id of Object.keys(snapshot)) {
              if (this.gameObjects[id]) {
                this.gameObjects[id].x = snapshot[id].x;
                this.gameObjects[id].y = snapshot[id].y;
              }
            }
          }
        } catch (error) {}
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
    `<script>${phaserSource(options)}</script><script>${user}</script><script>${gameScript(document, 'preview')}</script>`,
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
  zip.file('game.js', gameScript(document, 'zip'));
  for (const asset of document.assets) {
    zip.file(
      `assets/${asset.id}${ASSET_EXT[asset.mime]}`,
      Buffer.from(asset.dataBase64, 'base64'),
    );
  }
  return Buffer.from(await zip.generateAsync({ type: 'uint8array' }));
}
