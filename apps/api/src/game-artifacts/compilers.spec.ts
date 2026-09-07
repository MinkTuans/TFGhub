import { describe, expect, it } from 'vitest';
import { compileCode } from './code-compiler.js';
import { compilePlatformer } from './platformer-compiler.js';
import { compileStory } from './story-compiler.js';

describe('game artifact compilers', () => {
  it('keeps creator code that closes script or style tags inside safe serialized data', () => {
    const [artifact] = compileCode({
      sourceType: 'CODE',
      html: '<main id="game">Hello</main>',
      css: 'body::before { content: "</style><script>broken()</script>"; }',
      javascript: 'window.answer = "</script><script>broken()</script>";',
    });

    expect(artifact).toMatchObject({ path: 'index.html', contentType: 'text/html; charset=utf-8' });
    expect(artifact.content).toContain('\\u003c/style>');
    expect(artifact.content).toContain('\\u003c/script>');
    expect(artifact.content).not.toContain('</style><script>broken()');
    expect(artifact.content).not.toContain('</script><script>broken()');
  });

  it('renders story dialogue and choice buttons from serialized project data', () => {
    const [artifact] = compileStory({
      sourceType: 'STORY',
      startSceneId: 'intro',
      scenes: [
        {
          id: 'intro',
          speaker: 'Guide',
          dialogue: 'Choose a path.',
          backgroundColor: '#112233',
          choices: [{ text: 'Enter the forest', targetSceneId: 'forest' }],
        },
        {
          id: 'forest',
          speaker: 'Guide',
          dialogue: 'The trees whisper.',
          backgroundColor: '#223344',
          choices: [],
        },
      ],
    });

    expect(artifact.content).toContain('Choose a path.');
    expect(artifact.content).toContain('Enter the forest');
    expect(artifact.content).toContain("document.createElement('button')");
    expect(artifact.content).toContain('renderScene(choice.targetSceneId)');
  });

  it('serializes bounded platform geometry into a keyboard and collision runtime', () => {
    const [artifact] = compilePlatformer({
      sourceType: 'PLATFORMER',
      canvas: { width: 640, height: 480 },
      backgroundColor: '#101010',
      player: { x: 32, y: 32, color: '#ffffff' },
      goal: { x: 576, y: 400, color: '#00ff00' },
      platforms: [{ x: 0, y: 440, width: 640, height: 40, color: '#888888' }],
    });

    expect(artifact.content).toContain('"width":640');
    expect(artifact.content).toContain('"x":576');
    expect(artifact.content).toContain("addEventListener('keydown'");
    expect(artifact.content).toContain("addEventListener('keyup'");
    expect(artifact.content).toContain('requestAnimationFrame(frame)');
    expect(artifact.content).toContain('overlaps(player, platform)');
    expect(artifact.content).toContain("keys.has('ArrowUp') || keys.has(' ')");
    expect(artifact.content).toContain("event.key.toLowerCase() === 'r'");
    expect(artifact.content).toContain('function reset()');
  });
});
