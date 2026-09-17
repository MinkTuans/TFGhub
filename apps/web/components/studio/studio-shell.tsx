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
import { PixelStudioGuide } from "../pixel-studio-guide";
import {
  studioTasks,
  StudioStart,
  StudioCode,
  StudioPlay,
  StudioPresets,
  StudioAudioAssets,
  type StudioTask,
} from "./studio-task-panels";

export function StudioShell({ initialGame }: { initialGame: GameSummary }) {
  const { state } = useStudio();
  const [game, setGame] = useState(initialGame);
  const { selection, selectScene } = useStudioSelection();
  const [task, setTask] = useState<StudioTask>("Bắt đầu");
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
    <main className="studio-shell" aria-label="Xưởng sáng tạo trò chơi">
      <StudioTopbar
        initialGame={game}
        onGameChange={setGame}
        sceneId={scene.id}
        onSceneChange={selectScene}
        settingsOpen={settingsOpen}
        onSettingsToggle={() => setSettingsOpen((open) => !open)}
        settingsRef={settingsRef}
      />
      <StudioToast />
      <nav className="studio-task-nav" aria-label="Các bước sáng tạo">
        {studioTasks.map((item, index) => (
          <button
            key={item}
            aria-pressed={task === item}
            aria-controls={`studio-task-${index}`}
            onClick={() => setTask(item)}
          >
            <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
            {item}
          </button>
        ))}
      </nav>
      <div id="studio-task-0" hidden={task !== "Bắt đầu"}>
        {task === "Bắt đầu" && <StudioStart onTask={setTask} />}
      </div>
      <section
        id="studio-task-2"
        className="studio-task-panel"
        hidden={task !== "Tài nguyên"}
        aria-label="Nhập ảnh và âm thanh"
      >
        <h2>Nhập ảnh / âm thanh</h2>
        <p>
          Chọn Tải lên để nhập PNG, JPG, WebP hoặc WAV (tối đa 10 MiB mỗi tệp).
          Chọn “Thêm vào Cảnh” trên ảnh để thêm vào cảnh hiện tại.
        </p>
        <AssetManager
          onAssetsChange={setAssets}
          onPlaceAsset={(payload) => {
            setTask("Thiết kế");
            requestAnimationFrame(() => assetPlacement.current?.(payload));
          }}
        />
        <StudioAudioAssets assets={assets} />
      </section>
      <div id="studio-task-3" hidden={task !== "Code"}>
        <StudioCode scene={scene} />
      </div>
      <div id="studio-task-4" hidden={task !== "Chơi thử & xuất bản"}>
        <StudioPlay initialGame={game} onGameChange={setGame} />
      </div>
      <div
        id="studio-task-5"
        className="studio-task-panel"
        hidden={task !== "Hướng dẫn"}
      >
        {task === "Hướng dẫn" && <PixelStudioGuide compact />}
      </div>
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
      <section id="studio-task-1" hidden={task !== "Thiết kế"}>
        <StudioPresets scene={scene} />
        <div
          className="studio-layout"
          data-sidebar={sidebarOpen}
          data-inspector={inspectorOpen}
        >
          <StudioSidebar
            scenes={state.document.scenes}
            sceneId={scene.id}
            onSceneChange={selectScene}
            open={sidebarOpen}
            onToggle={toggleSidebar}
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
      </section>
      <div className="studio-bottom">
        <span>{state.document.scenes.length} Cảnh</span>
        <span>TFG Xưởng sáng tạo trò chơi</span>
      </div>
    </main>
  );
}
