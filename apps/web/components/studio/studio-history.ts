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

function lastRenames(commands: StudioMutation[]): StudioMutation[] {
  // Only pure rename gestures can collapse by scene ID. Mixed commands must
  // retain their complete reverse/forward execution order.
  if (commands.some((command) => command.type !== "scene.rename"))
    return commands;
  const last = new Map<string, StudioMutation>();
  for (const command of commands)
    if (command.type === "scene.rename") last.set(command.sceneId, command);
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
