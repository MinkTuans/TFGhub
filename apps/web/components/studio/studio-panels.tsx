import { useEffect, useMemo, useRef } from "react";
import {
  buildRenderList,
  type EngineProjectV2Type,
} from "@indieforge/contracts";
import { StudioButton } from "./studio-topbar";
import { LayerList } from "./layer-list";
import { renderScene } from "./canvas/scene-renderer";

type Scene = EngineProjectV2Type["scenes"][number];

export function StudioSceneOverview({
  scene,
  pixelArt = false,
}: {
  scene: Scene;
  pixelArt?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const list = useMemo(() => buildRenderList(scene), [scene]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const draw = () => {
      const { width, height } = canvas.getBoundingClientRect();
      if (width <= 0 || height <= 0) return;
      const pixelRatio = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(width * pixelRatio));
      canvas.height = Math.max(1, Math.round(height * pixelRatio));
      const zoom = Math.min(width / scene.width, height / scene.height);
      renderScene(
        context,
        list,
        {
          x: -(width / zoom - scene.width) / 2,
          y: -(height / zoom - scene.height) / 2,
          zoom,
          viewportWidth: width,
          viewportHeight: height,
        },
        { pixelRatio, surface: scene, pixelArt },
      );
    };
    draw();
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(draw);
    observer?.observe(canvas);
    window.addEventListener("resize", draw);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", draw);
    };
  }, [list, scene, pixelArt]);
  return (
    <section className="studio-overview" aria-label="Tổng quan Scene">
      <div className="studio-overview__heading">
        <h2 className="studio-kicker">{scene.name}</h2>
        <span className="studio-readonly">Xem Scene</span>
      </div>
      <div className="studio-canvas-stage">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={`Scene: ${scene.name}`}
          aria-describedby="studio-canvas-description"
        >
          Trình duyệt cần hỗ trợ Canvas2D để hiển thị Scene.
        </canvas>
      </div>
      <div className="studio-canvas-caption" id="studio-canvas-description">
        <p>
          {scene.width} × {scene.height} px <span aria-hidden="true">·</span>{" "}
          {scene.layers.length} lớp <span aria-hidden="true">·</span>{" "}
          {scene.objects.length} đối tượng
        </p>
        {scene.objects.length === 0 && (
          <p className="studio-muted">Scene này chưa có đối tượng.</p>
        )}
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
