import { LEGACY_ID_NAMESPACE, uuidV5 } from "../adapters/identity.js";
import type {
  ConditionV1,
  EventActionV1,
  EventTriggerV1,
} from "../event-schema.js";
import type { EngineProjectV1 } from "../project-schema.js";
import type { EngineProjectV2 } from "./project-schema.js";

type V1Component =
  EngineProjectV1["scenes"][number]["objects"][number]["components"][number];
type V2Component =
  EngineProjectV2["scenes"][number]["objects"][number]["components"][number];
type V2Condition = NonNullable<EngineProjectV2["events"][number]["condition"]>;
type V2Step = EngineProjectV2["events"][number]["steps"][number];

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

function uniqueOrders(values: ReadonlyArray<{ order: number }>): number[] {
  const result = Array<number>(values.length);
  values
    .map(({ order }, index) => ({ order, index }))
    .sort((left, right) =>
      left.order === right.order
        ? left.index - right.index
        : left.order < right.order
          ? -1
          : 1,
    )
    .forEach(({ index }, rank) => {
      result[index] = rank;
    });
  return result;
}

function collectExistingIds(project: EngineProjectV1): Set<string> {
  const ids = new Set(project.assetIds);
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (key === "id" && typeof child === "string") ids.add(child);
      visit(child);
    }
  };
  visit(project);
  return ids;
}

function createDerivedIdAllocator(project: EngineProjectV1) {
  const issued = collectExistingIds(project);
  return (kind: string, parentId: string) => {
    for (let collisionIndex = 0; ; collisionIndex += 1) {
      const name = `v1-to-v2/project:${project.projectId}/parent:${parentId}/kind:${kind}/collision:${collisionIndex}`;
      const candidate = uuidV5(name, LEGACY_ID_NAMESPACE);
      if (!issued.has(candidate)) {
        issued.add(candidate);
        return candidate;
      }
    }
  };
}

function customComponent(component: V1Component): V2Component {
  return {
    id: component.id,
    type: "Custom",
    version: 1,
    properties: {
      definitionKey: `tfg.v1.${component.type.toLowerCase()}`,
      config: structuredClone(component.properties) as Record<string, unknown>,
    },
  };
}

function transformExtent(components: V1Component[]) {
  const shape = components.find((component) => component.type === "Shape");
  if (shape?.type === "Shape") {
    return {
      width: clamp(shape.properties.width, 1, 65_536),
      height: clamp(shape.properties.height, 1, 65_536),
    };
  }
  return { width: 32, height: 32 };
}

function convertComponent(
  component: V1Component,
  choiceEvents: ReadonlyMap<string, string>,
  deriveId: (kind: string, parentId: string) => string,
  extent: { width: number; height: number },
): V2Component {
  switch (component.type) {
    case "Transform":
      if (
        component.properties.scaleX === 0 ||
        component.properties.scaleY === 0 ||
        Math.abs(component.properties.scaleX) > 1_000 ||
        Math.abs(component.properties.scaleY) > 1_000 ||
        Math.abs(component.properties.rotation) > 360_000 ||
        Math.abs(component.properties.x) > 1_000_000 ||
        Math.abs(component.properties.y) > 1_000_000
      ) {
        return customComponent(component);
      }
      return {
        id: component.id,
        type: "Transform",
        version: 1,
        properties: { ...component.properties, ...extent },
      };
    case "Sprite":
      return {
        id: component.id,
        type: "SpriteRenderer",
        version: 1,
        properties: { ...component.properties, flipX: false, flipY: false },
      };
    case "Animation": {
      const activeClip = component.properties.activeClip;
      return {
        id: component.id,
        type: "Animator",
        version: 1,
        properties: {
          assetId: null,
          frameWidth: clamp(Math.round(extent.width), 1, 8_192),
          frameHeight: clamp(Math.round(extent.height), 1, 8_192),
          initialState: activeClip,
          states: activeClip
            ? [
                {
                  name: activeClip,
                  row: 0,
                  frames: 1,
                  frameDurationMs: clamp(
                    Math.round(1_000 / component.properties.playbackRate),
                    1,
                    60_000,
                  ),
                  loop: component.properties.autoplay,
                },
              ]
            : [],
        },
      };
    }
    case "Health":
      return {
        id: component.id,
        type: "Health",
        version: 1,
        properties: component.properties,
      };
    case "Dialogue": {
      const nodeId = deriveId("dialogue-node", component.id);
      return {
        id: component.id,
        type: "Dialogue",
        version: 1,
        properties: {
          startNodeId: nodeId,
          nodes: [
            {
              id: nodeId,
              speakerName: component.properties.speaker,
              avatarAssetId: null,
              text: component.properties.text,
              choices: component.properties.choices.map(
                (choice: { id: string; text: string }) => ({
                  id: choice.id,
                  text: choice.text,
                  conditionId: null,
                  eventId: choiceEvents.get(choice.id) ?? null,
                }),
              ),
            },
          ],
        },
      };
    }
    case "Audio":
      return {
        id: component.id,
        type: "AudioSource",
        version: 1,
        properties: {
          ...component.properties,
          triggerEventId: null,
          fadeInMs: 0,
          fadeOutMs: 0,
        },
      };
    case "Physics":
    case "Movement":
    case "Collectible":
    case "Enemy":
    case "Portal":
    case "Text":
    case "Shape":
      return customComponent(component);
    default:
      throw new TypeError(
        `Unsupported V1 component type: ${String((component as { type?: unknown }).type)}`,
      );
  }
}

function convertCondition(condition: ConditionV1): V2Condition {
  switch (condition.type) {
    case "ALL":
    case "ANY":
      return {
        ...condition,
        conditions: condition.conditions.map(convertCondition),
      };
    case "NOT":
      return { ...condition, condition: convertCondition(condition.condition) };
    case "COMPARE_VARIABLE":
      return { ...condition, type: "VARIABLE_COMPARE" };
    case "OBJECT_EXISTS":
    case "HAS_COMPONENT":
      return condition;
    default:
      return condition satisfies never;
  }
}

function convertTrigger(trigger: EventTriggerV1) {
  switch (trigger.type) {
    case "GAME_START":
      return { type: "ON_START" as const };
    case "COLLISION":
      return { ...trigger, type: "ON_COLLISION" as const };
    case "CLICK":
      return { ...trigger, type: "ON_CLICK" as const };
    case "KEY_PRESS":
      return { ...trigger, type: "ON_KEY_PRESS" as const };
    case "TIMER":
      return { ...trigger, type: "ON_TIMER" as const };
    case "DIALOGUE_END":
      return { ...trigger, type: "ON_DIALOGUE_END" as const };
    case "CHOICE_SELECTED":
      return { ...trigger, type: "ON_CHOICE_SELECTED" as const };
    default:
      return trigger satisfies never;
  }
}

function convertAction(action: EventActionV1): V2Step {
  switch (action.type) {
    case "MOVE_OBJECT":
      return { ...action, durationMs: 0 };
    case "CREATE_OBJECT":
      return { ...action, type: "SPAWN_OBJECT" };
    case "CHANGE_VARIABLE":
      return { ...action, operation: "SET" };
    case "CHANGE_SCENE":
    case "DESTROY_OBJECT":
    case "PLAY_ANIMATION":
    case "PLAY_AUDIO":
    case "ADD_SCORE":
    case "CHANGE_HEALTH":
    case "SHOW_DIALOGUE":
    case "COMPLETE_GAME":
      return action;
    default:
      return action satisfies never;
  }
}

function inferObjectType(components: V1Component[]) {
  if (components.some((component) => component.type === "Movement")) {
    return "PLAYER" as const;
  }
  if (components.some((component) => component.type === "Collectible")) {
    return "ITEM" as const;
  }
  if (components.some((component) => component.type === "Dialogue")) {
    return "NPC" as const;
  }
  return "CUSTOM" as const;
}

function convertComponents(
  components: V1Component[],
  parentId: string,
  choiceEvents: ReadonlyMap<string, string>,
  deriveId: (kind: string, parentId: string) => string,
): V2Component[] {
  const extent = transformExtent(components);
  let hasNativeTransform = false;
  const converted = components.map((component) => {
    if (component.type === "Transform" && hasNativeTransform) {
      return customComponent(component);
    }
    const upgraded = convertComponent(
      component,
      choiceEvents,
      deriveId,
      extent,
    );
    if (upgraded.type === "Transform") hasNativeTransform = true;
    return upgraded;
  });
  if (!hasNativeTransform) {
    converted.unshift({
      id: deriveId("default-transform", parentId),
      type: "Transform",
      version: 1,
      properties: {
        x: 0,
        y: 0,
        ...extent,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
      },
    });
  }
  return converted;
}

export function upgradeEngineProjectV1(
  project: EngineProjectV1,
): EngineProjectV2 {
  const deriveId = createDerivedIdAllocator(project);
  const choiceEvents = new Map<string, string>();
  project.events.forEach((event) => {
    if (event.trigger.type === "CHOICE_SELECTED") {
      choiceEvents.set(event.trigger.choiceId, event.id);
    }
  });

  const sceneOrders = uniqueOrders(project.scenes);
  const eventOrders = uniqueOrders(project.events);

  const scenes = project.scenes.map((scene, sceneIndex) => {
    const layerId = deriveId("default-world-layer", scene.id);
    const objectOrders = uniqueOrders(scene.objects);
    return {
      id: scene.id,
      name: scene.name,
      key: `scene-${sceneIndex + 1}`,
      order: sceneOrders[sceneIndex]!,
      type: "MIXED" as const,
      width: project.settings.viewport.width,
      height: project.settings.viewport.height,
      background: { color: scene.backgroundColor ?? "#000000", assetId: null },
      settings: {
        gravityX: 0,
        gravityY: 0,
        grid: { enabled: false, size: 32, snap: false },
      },
      layers: [
        {
          id: layerId,
          name: "World",
          order: 0,
          type: "WORLD" as const,
          visible: true,
          locked: false,
        },
      ],
      objects: scene.objects.map((object, objectIndex) => {
        return {
          id: object.id,
          name: object.name,
          objectType: inferObjectType(object.components),
          parentId: object.parentId,
          layerId,
          enabled: object.enabled,
          visible: true,
          locked: false,
          order: objectOrders[objectIndex]!,
          renderOrder: objectOrders[objectIndex]!,
          components: convertComponents(
            object.components,
            object.id,
            choiceEvents,
            deriveId,
          ),
        };
      }),
    };
  });

  const prefabs = project.prefabs.map((prefab) => {
    return {
      id: prefab.id,
      name: prefab.name,
      objectType: inferObjectType(prefab.components),
      components: convertComponents(
        prefab.components,
        prefab.id,
        choiceEvents,
        deriveId,
      ),
    };
  });

  return {
    schemaVersion: 2,
    projectId: project.projectId,
    engineFamily: project.engineFamily,
    entrySceneId: project.entrySceneId,
    settings: { ...project.settings, pixelArt: false },
    assetIds: [...project.assetIds],
    scenes,
    variables: structuredClone(project.variables),
    prefabs,
    events: project.events.map((event, eventIndex) => ({
      id: event.id,
      version: event.version,
      name: event.name,
      enabled: event.enabled,
      order: eventOrders[eventIndex]!,
      trigger: convertTrigger(event.trigger),
      condition: event.condition ? convertCondition(event.condition) : null,
      steps: event.actions.map(convertAction),
    })),
    modules: [],
    scripts: [],
  };
}
