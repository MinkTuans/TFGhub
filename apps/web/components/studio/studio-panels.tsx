import { type EngineProjectV2Type } from "@indieforge/contracts";
import { StudioButton } from "./studio-topbar";
import { LayerList } from "./layer-list";
import { SceneCanvas } from "./canvas/scene-canvas";
import { PropertyInspector } from "./property-inspector";

type Scene = EngineProjectV2Type["scenes"][number];

export function StudioSceneOverview({
  scene,
  pixelArt = false,
}: {
  scene: Scene;
  pixelArt?: boolean;
}) {
  return <SceneCanvas scene={scene} pixelArt={pixelArt} />;
}

export function StudioInspector({
  scene,
  open,
  onToggle,
}: {
  scene: Scene;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <aside className="studio-inspector">
      <div className="studio-panel-heading">
        {open && <h2>Thông tin Scene</h2>}
        <StudioButton
          tooltip={open ? "Thu gọn thông tin Scene" : "Mở thông tin Scene"}
          aria-label={open ? "Thu gọn thông tin Scene" : "Mở thông tin Scene"}
          aria-expanded={open}
          aria-controls="studio-scene-info"
          onClick={onToggle}
        >
          {open ? "›" : "‹"}
        </StudioButton>
      </div>
      {open && (
        <section id="studio-scene-info" aria-label="Thông tin Scene">
          <PropertyInspector scene={scene} />
          <dl className="studio-properties">
            <div>
              <dt>Tên</dt>
              <dd>{scene.name}</dd>
            </div>
            <div>
              <dt>Kích thước</dt>
              <dd>
                {scene.width} × {scene.height} px
              </dd>
            </div>
            <div>
              <dt>Màu nền</dt>
              <dd>
                <span
                  className="studio-color"
                  style={{ backgroundColor: scene.background.color }}
                />
                {scene.background.color}
              </dd>
            </div>
            <div>
              <dt>Số lớp</dt>
              <dd>{scene.layers.length}</dd>
            </div>
            <div>
              <dt>Số đối tượng</dt>
              <dd>{scene.objects.length}</dd>
            </div>
          </dl>
          <LayerList key={scene.id} sceneId={scene.id} />
        </section>
      )}
    </aside>
  );
}

export function StudioSettings({
  document,
  sidebarOpen,
  inspectorOpen,
  onSidebarToggle,
  onInspectorToggle,
  onClose,
}: {
  document: EngineProjectV2Type;
  sidebarOpen: boolean;
  inspectorOpen: boolean;
  onSidebarToggle: () => void;
  onInspectorToggle: () => void;
  onClose: () => void;
}) {
  return (
    <section
      className="studio-settings studio-desktop"
      id="studio-settings"
      aria-label="Cài đặt Studio"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="studio-panel-heading">
        <h2>Cài đặt Studio</h2>
        <button type="button" onClick={onClose}>
          Đóng cài đặt
        </button>
      </div>
      <div className="studio-settings__body">
        <fieldset>
          <legend>Bố cục</legend>
          <label>
            <input
              type="checkbox"
              checked={sidebarOpen}
              onChange={onSidebarToggle}
            />
            Hiện danh sách Scene
          </label>
          <label>
            <input
              type="checkbox"
              checked={inspectorOpen}
              onChange={onInspectorToggle}
            />
            Hiện thông tin Scene
          </label>
        </fieldset>
        <dl className="studio-properties">
          <div>
            <dt>Khung hình dự án</dt>
            <dd>
              {document.settings.viewport.width} ×{" "}
              {document.settings.viewport.height} px
            </dd>
          </div>
          <div>
            <dt>Đồ họa pixel</dt>
            <dd>{document.settings.pixelArt ? "Bật" : "Tắt"}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
