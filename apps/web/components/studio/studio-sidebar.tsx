import type { ReactNode } from "react";
import type { EngineProjectV2Type } from "@indieforge/contracts";
import { StudioButton } from "./studio-topbar";
import { SceneManager } from "./scene-manager";
import { HierarchyPanel } from "./hierarchy-panel";

export function StudioSidebar({
  scenes,
  sceneId,
  onSceneChange,
  open,
  onToggle,
  assetManager,
}: {
  scenes: EngineProjectV2Type["scenes"];
  sceneId: string;
  onSceneChange: (id: string) => void;
  open: boolean;
  onToggle: () => void;
  assetManager?: ReactNode;
}) {
  return (
    <aside className="studio-sidebar" aria-label="Điều hướng Scene">
      <div className="studio-panel-heading">
        {open && (
          <h2>
            Scene <span className="studio-count">{scenes.length}</span>
          </h2>
        )}
        <StudioButton
          tooltip={open ? "Thu gọn danh sách Scene" : "Mở danh sách Scene"}
          aria-label={open ? "Thu gọn danh sách Scene" : "Mở danh sách Scene"}
          aria-expanded={open}
          aria-controls="studio-scene-list"
          onClick={onToggle}
        >
          {open ? "‹" : "›"}
        </StudioButton>
      </div>
      {open && (
        <>
          <HierarchyPanel
            scene={scenes.find((scene) => scene.id === sceneId)!}
          />
          {assetManager}
          <SceneManager sceneId={sceneId} onSceneChange={onSceneChange} />
        </>
      )}
    </aside>
  );
}
