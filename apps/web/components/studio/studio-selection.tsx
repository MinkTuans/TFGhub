"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { EngineProjectV2Type } from "@indieforge/contracts";
import type { StudioIdentity } from "./studio-state";

type Selection = {
  sceneId: string;
  objectId: string | null;
  focus: "canvas" | "hierarchy" | null;
  sequence: number;
};
const SelectionContext = createContext<{
  selection: Selection;
  selectScene: (id: string) => void;
  selectObject: (
    sceneId: string,
    id: string | null,
    focus?: Selection["focus"],
  ) => void;
} | null>(null);

/** Editor IDs only. Canonical objects always resolve from the provider document.
 * Session storage is optional preference storage, never the recovery envelope. */
export function StudioSelectionProvider({
  document,
  identity,
  ready,
  children,
}: {
  document: EngineProjectV2Type;
  identity: StudioIdentity;
  ready: boolean;
  children: ReactNode;
}) {
  const key = `tfg-studio-selection:${JSON.stringify([identity.userId, identity.gameId, identity.projectId])}`;
  const [stored, setStored] = useState<Selection>({
    sceneId: document.entrySceneId,
    objectId: null,
    focus: null,
    sequence: 0,
  });
  const [loaded, setLoaded] = useState(false);
  const scene =
    document.scenes.find((scene) => scene.id === stored.sceneId) ??
    document.scenes.find((scene) => scene.id === document.entrySceneId) ??
    document.scenes[0];
  const objectId =
    scene.id === stored.sceneId &&
    scene.objects.some((object) => object.id === stored.objectId)
      ? stored.objectId
      : null;
  // Clear removed IDs once; undo must not unexpectedly reselect deleted objects.
  if (
    ready &&
    loaded &&
    (stored.sceneId !== scene.id || stored.objectId !== objectId)
  ) {
    setStored({ ...stored, sceneId: scene.id, objectId, focus: null });
  }
  useEffect(() => {
    if (!ready) return;
    try {
      const value = JSON.parse(sessionStorage.getItem(key) ?? "null");
      if (
        value &&
        typeof value.sceneId === "string" &&
        (value.objectId === null || typeof value.objectId === "string")
      ) {
        // Read only after canonical recovery so a pending object's ID survives.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setStored({
          sceneId: value.sceneId,
          objectId: value.objectId,
          focus: null,
          sequence: 0,
        });
      }
    } catch {
      /* Local preferences are optional, including blocked storage. */
    }
    setLoaded(true);
  }, [key, ready]);
  useEffect(() => {
    if (!ready || !loaded) return;
    try {
      sessionStorage.setItem(
        key,
        JSON.stringify({ sceneId: scene.id, objectId }),
      );
    } catch {
      /* optional preference */
    }
  }, [key, ready, loaded, scene.id, objectId]);
  return (
    <SelectionContext
      value={{
        selection: { ...stored, sceneId: scene.id, objectId },
        selectScene: (id) =>
          setStored((previous) => ({
            sceneId: id,
            objectId: null,
            focus: null,
            sequence: previous.sequence + 1,
          })),
        selectObject: (sceneId, id, focus = null) =>
          setStored((previous) => ({
            sceneId,
            objectId: id,
            focus,
            sequence: previous.sequence + 1,
          })),
      }}
    >
      {children}
    </SelectionContext>
  );
}

export function useStudioSelection() {
  const selection = useContext(SelectionContext);
  if (!selection) throw new Error("useStudioSelection requires StudioProvider");
  return selection;
}
