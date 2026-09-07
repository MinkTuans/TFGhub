import { StoryProjectInput as StoryProjectSchema } from '@indieforge/contracts';
import type { StoryProjectInput } from '@indieforge/contracts';
import type { ArtifactFile } from './artifact-types.js';
import { serializeProject } from './artifact-types.js';

export function compileStory(input: StoryProjectInput): ArtifactFile[] {
  const project = StoryProjectSchema.parse(input);
  const data = serializeProject(project);

  return [{
    path: 'index.html',
    contentType: 'text/html; charset=utf-8',
    content: `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
  <body>
    <main id="game" aria-live="polite"></main>
    <script id="game-data" type="application/json">${data}</script>
    <script>
      const project = JSON.parse(document.getElementById('game-data').textContent);
      const root = document.getElementById('game');
      const scenes = new Map(project.scenes.map((scene) => [scene.id, scene]));
      function renderScene(sceneId) {
        const scene = scenes.get(sceneId);
        root.replaceChildren();
        root.style.backgroundColor = scene.backgroundColor;
        const speaker = document.createElement('h1');
        speaker.textContent = scene.speaker;
        const dialogue = document.createElement('p');
        dialogue.textContent = scene.dialogue;
        const choices = document.createElement('div');
        for (const choice of scene.choices) {
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = choice.text;
          button.addEventListener('click', () => renderScene(choice.targetSceneId));
          choices.append(button);
        }
        root.append(speaker, dialogue, choices);
      }
      renderScene(project.startSceneId);
    </script>
  </body>
</html>`,
  }];
}
