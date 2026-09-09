import type { EngineProjectV2Type } from "@indieforge/contracts";
import type { StudioMutation } from "./studio-state";

export type HistoryEntry = {
  undo: StudioMutation[];
  redo: StudioMutation[];
  gestureId?: string;
};
export type StudioHistory = {
  past: HistoryEntry[];
  future: HistoryEntry[];
  limit: number;
};

// Rename is the only authoring command in Task 10. New commands must add their
// inverse here alongside the engine reducer, rather than falling back to paths.
export function historyEntry(
  before: EngineProjectV2Type,
  after: EngineProjectV2Type,
  gestureId?: string,
): HistoryEntry {
  const undo: StudioMutation[] = [];
  const redo: StudioMutation[] = [];
  for (const scene of before.scenes) {
    const next = after.scenes.find(({ id }) => id === scene.id)!;
    if (scene.name !== next.name) {
      undo.push({ type: "scene.rename", sceneId: scene.id, name: scene.name });
      redo.push({ type: "scene.rename", sceneId: scene.id, name: next.name });
    }
  }
  return { undo, redo, gestureId };
}

function lastRenames(commands: StudioMutation[]): StudioMutation[] {
  const last = new Map<string, StudioMutation>();
  for (const command of commands) last.set(command.sceneId, command);
  return [...last.values()];
}

export function appendHistory(
  history: StudioHistory,
  entry: HistoryEntry,
): StudioHistory {
  const past = [...history.past];
  const previous = past.at(-1);
  if (
    entry.gestureId &&
    previous?.gestureId === entry.gestureId &&
    history.future.length === 0
  ) {
    past[past.length - 1] = {
      gestureId: entry.gestureId,
      undo: lastRenames([...entry.undo, ...previous.undo]),
      redo: lastRenames([...previous.redo, ...entry.redo]),
    };
  } else past.push(entry);
  return { ...history, past: past.slice(-history.limit), future: [] };
}
