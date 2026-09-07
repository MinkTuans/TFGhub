import { CodeProjectInput as CodeProjectSchema } from '@indieforge/contracts';
import type { CodeProjectInput } from '@indieforge/contracts';
import type { ArtifactFile } from './artifact-types.js';
import { serializeProject } from './artifact-types.js';

export function compileCode(input: CodeProjectInput): ArtifactFile[] {
  const project = CodeProjectSchema.parse(input);
  const data = serializeProject(project);

  return [{
    path: 'index.html',
    contentType: 'text/html; charset=utf-8',
    content: `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
  <body>
    <script id="game-data" type="application/json">${data}</script>
    <script>
      const project = JSON.parse(document.getElementById('game-data').textContent);
      const style = document.createElement('style');
      style.textContent = project.css;
      document.head.append(style);
      document.body.insertAdjacentHTML('afterbegin', project.html);
      new Function(project.javascript)();
    </script>
  </body>
</html>`,
  }];
}
