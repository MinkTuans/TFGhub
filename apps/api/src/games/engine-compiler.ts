import JSZip from 'jszip';
import type { GameProjectDocument } from '@indieforge/contracts';

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
  };
}

function runtimeScript(document: GameProjectDocument): string {
  return `(() => {
  const project = ${JSON.stringify(document)};
  const scene = project.scenes.find((item) => item.id === project.entryScene) || project.scenes[0];
  const canvas = document.createElement('canvas');
  canvas.width = scene.width;
  canvas.height = scene.height;
  canvas.setAttribute('aria-label', 'Game preview');
  document.body.style.margin = '0';
  document.body.style.background = '#000';
  document.body.style.display = 'flex';
  document.body.style.justifyContent = 'center';
  document.body.style.alignItems = 'center';
  document.body.style.minHeight = '100vh';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const bodies = scene.objects.map((item) => ({
    ...item,
    vx: item.bounce ? 140 : 0,
    vy: item.bounce ? 110 : 0,
  }));
  let last = performance.now();
  const frame = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    ctx.fillStyle = scene.background;
    ctx.fillRect(0, 0, scene.width, scene.height);
    for (const body of bodies) {
      if (body.bounce) {
        body.x += body.vx * dt;
        body.y += body.vy * dt;
        if (body.x < 0 || body.x + body.width > scene.width) {
          body.vx *= -1;
          body.x = Math.max(0, Math.min(body.x, scene.width - body.width));
        }
        if (body.y < 0 || body.y + body.height > scene.height) {
          body.vy *= -1;
          body.y = Math.max(0, Math.min(body.y, scene.height - body.height));
        }
      }
      ctx.fillStyle = body.color;
      ctx.fillRect(body.x, body.y, body.width, body.height);
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
})();`;
}

function indexHtml(scriptTag: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>IndieForge</title>
  </head>
  <body>
    ${scriptTag}
  </body>
</html>
`;
}

export function compilePreviewHtml(document: GameProjectDocument): string {
  return indexHtml(`<script>${runtimeScript(document)}</script>`);
}

export async function compileHtml5Zip(document: GameProjectDocument): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('index.html', indexHtml('<script src="game.js"></script>'));
  zip.file('game.js', runtimeScript(document));
  return Buffer.from(await zip.generateAsync({ type: 'uint8array' }));
}
