import type { EngineProjectV2Type } from "@indieforge/contracts";
import { StudioButton } from "./studio-topbar";

export function StudioSidebar({
  scenes,
  sceneId,
  onSceneChange,
  open,
  onToggle,
}: {
  scenes: EngineProjectV2Type["scenes"];
  sceneId: string;
  onSceneChange: (id: string) => void;
  open: boolean;
  onToggle: () => void;
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
        <nav id="studio-scene-list" aria-label="Danh sách Scene">
          {[...scenes]
            .sort((a, b) => a.order - b.order)
            .map((scene, index) => (
              <button
                key={scene.id}
                type="button"
                aria-pressed={scene.id === sceneId}
                onClick={() => onSceneChange(scene.id)}
              >
                <span className="studio-scene-number" aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span>{scene.name}</span>
              </button>
            ))}
        </nav>
      )}
    </aside>
  );
}
