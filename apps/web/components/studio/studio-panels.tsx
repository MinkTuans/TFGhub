import type { EngineProjectV2Type } from "@indieforge/contracts";
import { StudioButton } from "./studio-topbar";

type Scene = EngineProjectV2Type["scenes"][number];

export function StudioSceneOverview({ scene }: { scene: Scene }) {
  return (
    <section className="studio-overview" aria-label="Tổng quan Scene">
      <div className="studio-overview__heading">
        <span className="studio-kicker">Scene / Tổng quan</span>
        <span className="studio-readonly">Thông tin dự án</span>
      </div>
      <div className="studio-overview__content">
        <p className="studio-kicker">Scene hiện tại</p>
        <h2>{scene.name}</h2>
        <p>
          {scene.width} × {scene.height} px <span aria-hidden="true">·</span>{" "}
          {scene.layers.length} lớp <span aria-hidden="true">·</span>{" "}
          {scene.objects.length} đối tượng
        </p>
        <p className="studio-muted">
          {scene.objects.length
            ? "Chọn Scene trong danh sách để xem thông tin của từng cảnh."
            : "Scene này chưa có đối tượng."}
        </p>
      </div>
    </section>
  );
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
