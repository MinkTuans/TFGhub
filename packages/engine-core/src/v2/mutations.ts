import { z } from "zod";
import { StableId } from "../stable-id.js";
import { EngineProjectV2 } from "./project-schema.js";

export const SceneMutation = z
  .object({
    type: z.literal("scene.rename"),
    sceneId: StableId,
    name: z.string().trim().min(1).max(80),
  })
  .strict();

// Add command variants only alongside their reducer and authoring consumer.
export const ProjectMutation = z.discriminatedUnion("type", [SceneMutation]);
export type SceneMutation = z.infer<typeof SceneMutation>;
export type ProjectMutation = z.infer<typeof ProjectMutation>;

export class ProjectMutationTargetError extends Error {
  constructor(readonly targetId: string) {
    super(`Scene mutation target does not exist: ${targetId}`);
  }
}

/** Applies an ordered batch to a detached document, or throws without changing either input. */
export function applyProjectMutations(
  project: EngineProjectV2,
  mutations: ProjectMutation[],
): EngineProjectV2 {
  // Zod's unknown Custom config values can retain nested input references.
  const next = structuredClone(EngineProjectV2.parse(project));
  const commands = z.array(ProjectMutation).parse(mutations);
  for (const command of commands) {
    switch (command.type) {
      case "scene.rename": {
        const scene = next.scenes.find(({ id }) => id === command.sceneId);
        if (!scene) throw new ProjectMutationTargetError(command.sceneId);
        scene.name = command.name;
        break;
      }
    }
  }
  return EngineProjectV2.parse(next);
}
