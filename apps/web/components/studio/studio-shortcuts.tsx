"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type KeyboardEvent,
  type MutableRefObject,
  type ReactNode,
} from "react";

type Shortcuts = {
  keyDown: (event: KeyboardEvent) => void;
  keyUp: (event: KeyboardEvent) => void;
  blur: () => void;
};
const ShortcutContext =
  createContext<MutableRefObject<Shortcuts | null> | null>(null);
const boundary = "[data-studio-shortcuts]";
function surface(target: EventTarget | null) {
  return (
    target instanceof Element &&
    !target.closest(
      "input, textarea, select, button, [contenteditable], dialog",
    ) &&
    !!target.closest('canvas, [role="treeitem"]')
  );
}

/** One editor-local keyboard route for the active canvas and its hierarchy.
 * Native control keys and events from other Studios never enter this route. */
export function StudioShortcutsProvider({ children }: { children: ReactNode }) {
  const shortcuts = useRef<Shortcuts | null>(null);
  return (
    <ShortcutContext value={shortcuts}>
      <div
        data-studio-shortcuts=""
        style={{ display: "contents" }}
        onKeyDown={(event) => {
          if (
            surface(event.target) &&
            (event.target as Element).closest(boundary) ===
              event.currentTarget &&
            !event.currentTarget.querySelector("dialog[open]")
          )
            shortcuts.current?.keyDown(event);
        }}
        onKeyUp={(event) => {
          if (
            (event.target as Element).closest(boundary) === event.currentTarget
          )
            shortcuts.current?.keyUp(event);
        }}
        onBlur={(event) => {
          if (
            (event.target as Element).closest(boundary) ===
              event.currentTarget &&
            (!surface(event.relatedTarget) ||
              (event.relatedTarget as Element).closest(boundary) !==
                event.currentTarget)
          )
            shortcuts.current?.blur();
        }}
      >
        {children}
      </div>
    </ShortcutContext>
  );
}

export function useStudioShortcuts(handlers: Shortcuts) {
  const shortcutsRef = useContext(ShortcutContext);
  if (!shortcutsRef)
    throw new Error("useStudioShortcuts requires StudioProvider");
  useEffect(() => {
    shortcutsRef.current = handlers;
    return () => {
      if (shortcutsRef.current === handlers) shortcutsRef.current = null;
    };
  });
}
