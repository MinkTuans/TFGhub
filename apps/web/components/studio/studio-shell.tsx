"use client";

import { useRef, useState } from "react";
import type { GameSummary } from "@indieforge/contracts";
import { useStudio } from "./studio-provider";
import { StudioTopbar } from "./studio-topbar";
import { StudioSidebar } from "./studio-sidebar";
import {
  StudioInspector,
  StudioSceneOverview,
  StudioSettings,
} from "./studio-panels";
import { StudioToast } from "./studio-toast";
import "./studio-shell.css";

export function StudioShell({ initialGame }: { initialGame: GameSummary }) {
  const { state } = useStudio();
  const [selectedSceneId, setSelectedSceneId] = useState(
    state.document.entrySceneId,
  );
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLButtonElement>(null);
  // A recovered document may no longer contain the previous local selection.
  const scene =
    state.document.scenes.find((scene) => scene.id === selectedSceneId) ??
    state.document.scenes.find(
      (scene) => scene.id === state.document.entrySceneId,
    ) ??
    state.document.scenes[0];
  const toggleSidebar = () => setSidebarOpen((open) => !open);
  const toggleInspector = () => setInspectorOpen((open) => !open);
  return (
    <main className="studio-shell" aria-label="Game Studio">
      <StudioTopbar
        initialGame={initialGame}
        sceneId={scene.id}
        onSceneChange={setSelectedSceneId}
        settingsOpen={settingsOpen}
        onSettingsToggle={() => setSettingsOpen((open) => !open)}
        settingsRef={settingsRef}
      />
      <StudioToast />
      {settingsOpen && (
        <StudioSettings
          document={state.document}
          sidebarOpen={sidebarOpen}
          inspectorOpen={inspectorOpen}
          onSidebarToggle={toggleSidebar}
          onInspectorToggle={toggleInspector}
          onClose={() => {
            setSettingsOpen(false);
            settingsRef.current?.focus();
          }}
        />
      )}
      <div
        className="studio-desktop studio-layout"
        data-sidebar={sidebarOpen}
        data-inspector={inspectorOpen}
      >
        <StudioSidebar
          scenes={state.document.scenes}
          sceneId={scene.id}
          onSceneChange={setSelectedSceneId}
          open={sidebarOpen}
          onToggle={toggleSidebar}
        />
        <StudioSceneOverview
          scene={scene}
          pixelArt={state.document.settings.pixelArt}
        />
        <StudioInspector
          scene={scene}
          open={inspectorOpen}
          onToggle={toggleInspector}
        />
      </div>
      <section
        className="studio-mobile"
        aria-label="Studio trên thiết bị di động"
      >
        <h2>Thông tin game</h2>
        <p>
          Bạn có thể đổi tên game tại đây. Mở Studio trên máy tính để xem các
          Scene và bố cục dự án.
        </p>
        <p className="studio-muted">
          {state.document.scenes.length} Scene · Khung hình{" "}
          {state.document.settings.viewport.width} ×{" "}
          {state.document.settings.viewport.height} px
        </p>
      </section>
      <div className="studio-bottom">
        <span>{state.document.scenes.length} Scene</span>
        <span>TFG Game Studio</span>
      </div>
    </main>
  );
}
