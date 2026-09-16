import { EngineProjectV2 } from '../v2/project-schema.js';
import { v2ComponentRegistry, type V2ComponentType } from '../v2/component-registry.js';
import type { ComponentInstanceV2, GameObjectV2 } from '../v2/scene-schema.js';
import type { GameEventV2, EventStepV2 } from '../v2/event-schema.js';
/** A regular, fully editable V2 document: no title-specific gameplay. */
export function createPixelAdventure(projectId: string, newId: () => string): EngineProjectV2 {
    const sceneId = newId(), groundLayer = newId(), worldLayer = newId();
    const objects: GameObjectV2[] = [], events: GameEventV2[] = [];
    const component = (type: V2ComponentType, properties: Record<string, unknown>): ComponentInstanceV2 => ({
        id: newId(), type, version: 1, properties: { ...v2ComponentRegistry[type].defaults() as Record<string, unknown>, ...properties },
    });
    const object = (name: string, objectType: GameObjectV2['objectType'], x: number, y: number, width: number, height: number, frame: string, extra: ComponentInstanceV2[] = [], ground = false) => {
        const value: GameObjectV2 = { id: newId(), name, objectType, parentId: null, layerId: ground ? groundLayer : worldLayer, enabled: true, visible: true, locked: false, order: objects.length, renderOrder: ground ? 0 : objects.length + 1,
            components: [component('Transform', { x, y, width, height }), component('SpriteRenderer', { frame }), ...extra] };
        objects.push(value);
        return value;
    };
    const collider = (width: number, height: number, isTrigger = false) => component('Collider', { width, height, isTrigger });
    const event = (name: string, trigger: GameEventV2['trigger'], steps: EventStepV2[], condition: GameEventV2['condition'] = null) => {
        const value: GameEventV2 = { id: newId(), version: 1, name, enabled: true, order: events.length, trigger, condition, steps };
        events.push(value);
        return value;
    };
    type StepInput<T = EventStepV2> = T extends EventStepV2 ? Omit<T, 'id' | 'version'> : never;
    const step = (data: StepInput): EventStepV2 => ({ id: newId(), version: 1, ...data }) as EventStepV2;
    // Individual grass tiles and barriers can be moved or replaced in Studio.
    for (let y = 32; y < 384; y += 32)
        for (let x = 32; x < 608; x += 32)
            object('Cỏ đảo', 'DECORATION', x, y, 32, 32, 'tfg:grass', [], true);
    for (let x = 0; x < 640; x += 32)
        for (const y of [0, 384])
            object('Bờ đá', 'DECORATION', x, y, 32, 32, 'tfg:stone', [collider(32, 32)]);
    for (let y = 32; y < 384; y += 32)
        for (const x of [0, 608])
            object('Bờ đá', 'DECORATION', x, y, 32, 32, 'tfg:stone', [collider(32, 32)]);
    for (const [x, y] of [[192, 96], [192, 128], [192, 160], [192, 192], [192, 224], [384, 192], [416, 192], [448, 192], [480, 192], [384, 64], [384, 96]])
        object('Cây chắn lối', 'DECORATION', x!, y!, 32, 32, 'tfg:tree', [collider(32, 32)]);
    const health = component('Health', { current: 3, maximum: 3 });
    const hero = object('Linh — người giữ đèn', 'PLAYER', 48, 336, 24, 24, 'tfg:hero', [collider(24, 24), component('Movement', { speed: 128, controls: 'PLAYER' }), health]);
    for (const [index, [x, y]] of [[96, 64], [272, 80], [528, 96], [288, 304], [528, 320]].entries()) {
        const crystal = object(`Đom đóm ${index + 1}`, 'ITEM', x!, y!, 24, 24, 'tfg:crystal', [collider(24, 24, true), component('InventoryItem', { itemKey: `firefly_${index + 1}`, displayName: 'Tinh thể đom đóm', description: 'Gom đủ 5 tinh thể rồi đến hải đăng.' })]);
        event(`Nhặt đom đóm ${index + 1}`, { type: 'ON_COLLECT_ITEM', itemObjectId: crystal.id, collectorObjectId: hero.id }, [step({ type: 'ADD_SCORE', amount: 1 })]);
    }
    for (const [index, [x, y]] of [[128, 192], [288, 176], [448, 288]].entries()) {
        const hazard = object(`Bụi gai ${index + 1}`, 'DECORATION', x!, y!, 32, 32, 'tfg:hazard', [collider(32, 32, true)]);
        event(`Gai làm mất một tim ${index + 1}`, { type: 'ON_COLLISION', firstObjectId: hero.id, secondObjectId: hazard.id }, [step({ type: 'CHANGE_HEALTH', objectId: hero.id, componentId: health.id, amount: -1 })]);
    }
    const gate = object('Hải đăng — cần 5 đom đóm', 'TRIGGER', 544, 32, 32, 48, 'tfg:gate', [collider(32, 48, true)]);
    event('Thắp sáng hải đăng', { type: 'ON_ENTER_AREA', areaObjectId: gate.id, enteringObjectId: hero.id }, [step({ type: 'COMPLETE_GAME' })], { id: newId(), version: 1, type: 'SCORE_COMPARE', operator: 'GREATER_THAN_OR_EQUAL', value: 5 });
    return EngineProjectV2.parse({ schemaVersion: 2, projectId, engineFamily: 'TFG_ENGINE', entrySceneId: sceneId, settings: { viewport: { width: 640, height: 416 }, pixelArt: true }, assetIds: [],
        scenes: [{ id: sceneId, name: 'Đảo Đom Đóm', key: 'firefly-island', order: 0, type: 'MAP', width: 640, height: 416, background: { color: '#173e54', assetId: null }, settings: { gravityX: 0, gravityY: 0, grid: { enabled: true, size: 32, snap: true } }, layers: [{ id: groundLayer, name: 'Thảm cỏ', order: 0, type: 'WORLD', visible: true, locked: false }, { id: worldLayer, name: 'Nhân vật và thử thách', order: 1, type: 'WORLD', visible: true, locked: false }], objects }],
        variables: { global: [], player: [], scene: {} }, prefabs: [], events, modules: [], scripts: [{ id: newId(), version: 1, name: 'Lời chào trên đảo', language: 'JAVASCRIPT', source: '// Đổi lời chào rồi lưu, dựng và chơi lại để thấy thay đổi.\napi.showDialogue("Đảo Đom Đóm: gom 5 tinh thể, tránh bụi gai, rồi đến hải đăng! Di chuyển bằng WASD, phím mũi tên hoặc nút cảm ứng.");', capabilities: ['SHOW_DIALOGUE'], attachments: [{ id: newId(), type: 'SCENE', sceneId }] }] });
}
