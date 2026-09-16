import { describe, expect, it } from 'vitest';
import { EngineProjectV2 } from '../v2/project-schema.js';
import { createPixelAdventure } from './pixel-adventure.js';
import { createGameRuntime } from '../runtime/game-runtime.js';
import { BUILTIN_PIXEL_SPRITES } from './pixel-art.js';
function sample() {
    let n = 1;
    return createPixelAdventure('00000000-0000-4000-8000-000000000000', () => `00000000-0000-4000-8000-${String(n++).padStart(12, '0')}`);
}
describe('editable pixel adventure', () => {
    it('roundtrips with valid references and no external assets', () => {
        const project = sample();
        expect(EngineProjectV2.parse(JSON.parse(JSON.stringify(project)))).toEqual(project);
        expect(project.assetIds).toEqual([]);
        expect(project.scripts[0]?.attachments[0]).toMatchObject({ type: 'SCENE', sceneId: project.entrySceneId });
        for (const object of project.scenes[0]!.objects) {
            const sprite = object.components.find(c => c.type === 'SpriteRenderer')?.properties as {
                frame: string;
            } | undefined;
            if (sprite)
                expect(BUILTIN_PIXEL_SPRITES[sprite.frame]).toBeDefined();
        }
    });
    it('makes every goal reachable without crossing walls or hazards using the full player footprint', () => {
        const project = sample();
        const scene = project.scenes[0]!;
        const player = scene.objects.find(o => o.objectType === 'PLAYER')!;
        const box = (o: typeof player) => o.components.find(c => c.type === 'Transform')!.properties as {
            x: number;
            y: number;
            width: number;
            height: number;
        };
        const p = box(player);
        const blocked = scene.objects.filter(o => o !== player && o.components.some(c => c.type === 'Collider' && !(c.properties as {
            isTrigger: boolean;
        }).isTrigger) || o.name.startsWith('Bụi gai'));
        const intersects = (x: number, y: number, b: ReturnType<typeof box>) => x < b.x + b.width && x + p.width > b.x && y < b.y + b.height && y + p.height > b.y;
        const queue = [[p.x, p.y]];
        const seen = new Set([`${p.x},${p.y}`]);
        for (let i = 0; i < queue.length; i++) {
            const [x, y] = queue[i]!;
            for (const [dx, dy] of [[8, 0], [-8, 0], [0, 8], [0, -8]]) {
                const nx = x! + dx!, ny = y! + dy!, key = `${nx},${ny}`;
                if (nx < 0 || ny < 0 || nx + p.width > scene.width || ny + p.height > scene.height || seen.has(key) || blocked.some(o => intersects(nx, ny, box(o))))
                    continue;
                seen.add(key);
                queue.push([nx, ny]);
            }
        }
        const goals = scene.objects.filter(o => o.objectType === 'ITEM' || o.objectType === 'TRIGGER');
        expect(goals.length).toBeGreaterThanOrEqual(4);
        for (const goal of goals)
            expect(queue.some(([x, y]) => intersects(x!, y!, box(goal))), goal.name).toBe(true);
    });
    it('requires all collectible scores to win and supports lethal repeat hazard entries', () => {
        const project = sample();
        const pickups = project.events.filter(e => e.trigger.type === 'ON_COLLECT_ITEM');
        expect(pickups).toHaveLength(5);
        expect(pickups.every(e => e.steps.some(s => s.type === 'ADD_SCORE' && s.amount === 1))).toBe(true);
        const exit = project.events.find(e => e.trigger.type === 'ON_ENTER_AREA')!;
        expect(exit.condition).toMatchObject({ type: 'SCORE_COMPARE', operator: 'GREATER_THAN_OR_EQUAL', value: pickups.length });
        expect(exit.steps).toEqual([expect.objectContaining({ type: 'COMPLETE_GAME' })]);
        const hazard = project.events.find(e => e.trigger.type === 'ON_COLLISION')!;
        expect(hazard.steps[0]).toMatchObject({ type: 'CHANGE_HEALTH', amount: -1 });
        const health = project.scenes[0]!.objects.find(o => o.objectType === 'PLAYER')!.components.find(c => c.type === 'Health')!;
        expect(health.properties).toEqual({ current: 3, maximum: 3 });
        expect(sample()).toEqual(project);
    });
    it('plays through the real runtime, loses on repeated hazard entry, and restarts cleanly', () => {
        const runtime = createGameRuntime(sample());
        const hero = runtime.scene().objects.find(o => o.objectType === 'PLAYER')!;
        const transform = runtime.properties(hero, 'Transform')!;
        const health = runtime.properties(hero, 'Health')!;
        const moveTo = (object: typeof hero) => {
            const destination = runtime.properties(object, 'Transform')!;
            transform.x = destination.x;
            transform.y = destination.y;
            runtime.tick(0);
        };
        const gate = runtime.scene().objects.find(o => o.objectType === 'TRIGGER')!;
        moveTo(gate);
        expect(runtime.state.status).toBe('playing');
        for (const crystal of runtime.scene().objects.filter(o => o.objectType === 'ITEM'))
            moveTo(crystal);
        expect(runtime.state.score).toBe(5);
        expect(Object.keys(runtime.state.inventory)).toHaveLength(5);
        moveTo(gate);
        expect(runtime.state.status).toBe('won');
        runtime.restart();
        expect(runtime.state.score).toBe(0);
        expect(runtime.state.inventory).toEqual({});
        expect(runtime.scene().objects.filter(o => o.objectType === 'ITEM' && o.enabled)).toHaveLength(5);
        const resetHero = runtime.scene().objects.find(o => o.objectType === 'PLAYER')!;
        const resetPosition = runtime.properties(resetHero, 'Transform')!;
        const hazard = runtime.scene().objects.find(o => o.name === 'Bụi gai 1')!;
        const target = runtime.properties(hazard, 'Transform')!;
        for (let i = 0; i < 3; i++) {
            resetPosition.x = target.x;
            resetPosition.y = target.y;
            runtime.tick(0);
            expect(runtime.properties(resetHero, 'Health')!.current).toBe(2 - i);
            runtime.tick(0); // Holding contact does not drain another heart.
            expect(runtime.properties(resetHero, 'Health')!.current).toBe(2 - i);
            resetPosition.x = 48;
            resetPosition.y = 336;
            runtime.tick(0);
        }
        expect(runtime.state.status).toBe('lost');
        expect(health.current).toBe(3); // Snapshot from the previous run was not mutated.
        runtime.restart();
        expect(runtime.state.status).toBe('playing');
        expect(runtime.properties(runtime.scene().objects.find(o => o.objectType === 'PLAYER'), 'Health')!.current).toBe(3);
        expect(runtime.state.diagnostics).toEqual([]);
    });
    it('contains rectangular palette-complete pixel sprites', () => {
        for (const sprite of Object.values(BUILTIN_PIXEL_SPRITES)) {
            expect(sprite.pixels).toHaveLength(sprite.height);
            for (const row of sprite.pixels) {
                expect(row).toHaveLength(sprite.width);
                for (const pixel of row)
                    if (pixel !== '.')
                        expect(sprite.palette[pixel]).toMatch(/^#[0-9a-f]{6}$/i);
            }
        }
    });
});
