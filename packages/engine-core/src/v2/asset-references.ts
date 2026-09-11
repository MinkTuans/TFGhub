import type { ComponentInstanceV2 } from "./scene-schema.js";
import type { EventStepV2 } from "./event-schema.js";
import type { EngineProjectV2 } from "./project-schema.js";

function addReference(references: Set<string>, value: unknown) {
  if (typeof value === "string") references.add(value);
}

function collectComponentReferences(
  references: Set<string>,
  components: readonly ComponentInstanceV2[],
) {
  for (const component of components) {
    const properties = component.properties as Record<string, unknown>;
    switch (component.type) {
      case "SpriteRenderer":
      case "Animator":
      case "AudioSource":
      case "UIImage":
        addReference(references, properties.assetId);
        break;
      case "InventoryItem":
        addReference(references, properties.iconAssetId);
        break;
      case "Text":
        addReference(references, properties.fontAssetId);
        break;
      case "Tilemap":
        addReference(references, properties.tilesetAssetId);
        break;
      case "Dialogue": {
        const nodes = Array.isArray(properties.nodes) ? properties.nodes : [];
        for (const node of nodes) {
          if (typeof node === "object" && node !== null)
            addReference(
              references,
              (node as Record<string, unknown>).avatarAssetId,
            );
        }
        break;
      }
      default:
        break;
    }
  }
}

function collectEventReferences(
  references: Set<string>,
  initialSteps: readonly EventStepV2[],
) {
  const pending = [...initialSteps];
  for (let step = pending.pop(); step; step = pending.pop()) {
    if (step.type === "PLAY_AUDIO" || step.type === "STOP_AUDIO") {
      addReference(references, step.assetId);
    } else if (step.type === "SEQUENCE" || step.type === "REPEAT") {
      pending.push(...step.steps);
    } else if (step.type === "IF_ELSE") {
      pending.push(...step.thenSteps, ...step.elseSteps);
    }
  }
}

/**
 * Collects semantic asset references without walking the declaration array.
 * The declaration list remains canonical project state, but is intentionally
 * excluded because declaring an asset is not itself a usage dependency.
 */
export function collectProjectAssetReferences(
  project: EngineProjectV2,
): Set<string> {
  const references = new Set<string>();
  for (const scene of project.scenes) {
    addReference(references, scene.background.assetId);
    for (const object of scene.objects)
      collectComponentReferences(references, object.components);
  }
  for (const prefab of project.prefabs)
    collectComponentReferences(references, prefab.components);
  for (const event of project.events)
    collectEventReferences(references, event.steps);
  for (const module of project.modules) {
    if (module.type === "PUZZLE") {
      for (const piece of module.config.pieces)
        addReference(references, piece.assetId);
    } else if (module.type === "MEMORY") {
      for (const card of module.config.cards)
        addReference(references, card.assetId);
    } else if (module.type === "DRAG_DROP") {
      for (const item of module.config.items)
        addReference(references, item.assetId);
      for (const target of module.config.targets)
        addReference(references, target.assetId);
    }
  }
  return references;
}
