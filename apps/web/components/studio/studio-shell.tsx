"use client";

import { useMemo, useRef, useState } from "react";
import type { GameAssetSummary, GameSummary } from "@indieforge/contracts";
import { useStudio } from "./studio-provider";
import { StudioTopbar } from "./studio-topbar";
import { StudioSidebar } from "./studio-sidebar";
import {
  StudioInspector,
  StudioSceneOverview,
  StudioSettings,
} from "./studio-panels";
import { StudioToast } from "./studio-toast";
import { useStudioSelection } from "./studio-selection";
import "./studio-shell.css";
import { AssetManager } from "./assets/asset-manager";

export function StudioShell({ initialGame }: { initialGame: GameSummary }) {
  const { state } = useStudio();
  const { selection, selectScene } = useStudioSelection();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [assets, setAssets] = useState<GameAssetSummary[]>([]);
  const settingsRef = useRef<HTMLButtonElement>(null);
  const assetPlacement = useRef<((payload: string) => void) | null>(null);
  const assetMetadata = useMemo(
    () =>
      assets.map((asset) => ({
        id: asset.id,
        projectId: asset.projectId,
        state: asset.state,
        kind: asset.kind,
        displayName: asset.displayName,
        width: asset.width,
        height: asset.height,
      })),
    [assets],
  );
  // A recovered document may no longer contain the previous local selection.
  const scene =
    state.document.scenes.find((scene) => scene.id === selection.sceneId) ??
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
        onSceneChange={selectScene}
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
          onSceneChange={selectScene}
          open={sidebarOpen}
          onToggle={toggleSidebar}
          assetManager={
            <AssetManager
              onAssetsChange={setAssets}
              onPlaceAsset={(payload) => assetPlacement.current?.(payload)}
            />
          }
        />
        <StudioSceneOverview
          scene={scene}
          pixelArt={state.document.settings.pixelArt}
          assetMetadata={assetMetadata}
          registerAssetPlacement={(handler) => {
            assetPlacement.current = handler;
          }}
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
