import { PlatformerProjectInput as PlatformerProjectSchema } from '@indieforge/contracts';
import type { PlatformerProjectInput } from '@indieforge/contracts';
import type { ArtifactFile } from './artifact-types.js';
import { serializeProject } from './artifact-types.js';

export function compilePlatformer(input: PlatformerProjectInput): ArtifactFile[] {
  const project = PlatformerProjectSchema.parse(input);
  const data = serializeProject(project);

  return [{
    path: 'index.html',
    contentType: 'text/html; charset=utf-8',
    content: `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
  <body>
    <canvas id="game" aria-label="Platform game"></canvas>
    <p id="status" role="status"></p>
    <script id="game-data" type="application/json">${data}</script>
    <script>
      const project = JSON.parse(document.getElementById('game-data').textContent);
      const canvas = document.getElementById('game');
      const context = canvas.getContext('2d');
      const status = document.getElementById('status');
      canvas.width = project.canvas.width;
      canvas.height = project.canvas.height;
      const player = { ...project.player, width: 24, height: 24, velocityX: 0, velocityY: 0 };
      const keys = new Set();
      addEventListener('keydown', (event) => keys.add(event.key));
      addEventListener('keyup', (event) => keys.delete(event.key));
      function overlaps(left, right) {
        return left.x < right.x + right.width && left.x + left.width > right.x
          && left.y < right.y + right.height && left.y + left.height > right.y;
      }
      function update() {
        player.velocityX = (keys.has('ArrowRight') ? 4 : 0) - (keys.has('ArrowLeft') ? 4 : 0);
        player.velocityY += 0.5;
        player.x = Math.max(0, Math.min(canvas.width - player.width, player.x + player.velocityX));
        player.y = Math.min(canvas.height - player.height, player.y + player.velocityY);
        for (const platform of project.platforms) {
          if (player.velocityY >= 0 && overlaps(player, platform)
            && player.y + player.height - player.velocityY <= platform.y) {
            player.y = platform.y - player.height;
            player.velocityY = 0;
          }
        }
        if (overlaps(player, { ...project.goal, width: 24, height: 24 })) status.textContent = 'Goal reached!';
      }
      function draw() {
        context.fillStyle = project.backgroundColor;
        context.fillRect(0, 0, canvas.width, canvas.height);
        for (const platform of project.platforms) {
          context.fillStyle = platform.color;
          context.fillRect(platform.x, platform.y, platform.width, platform.height);
        }
        context.fillStyle = project.goal.color;
        context.fillRect(project.goal.x, project.goal.y, 24, 24);
        context.fillStyle = player.color;
        context.fillRect(player.x, player.y, player.width, player.height);
      }
      function frame() {
        update();
        draw();
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    </script>
  </body>
</html>`,
  }];
}
