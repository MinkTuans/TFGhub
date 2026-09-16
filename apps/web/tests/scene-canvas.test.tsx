import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useEffect, useState } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  applyProjectMutations,
  buildRenderList,
  EngineProjectV2,
  v2ComponentRegistry,
  type EngineProjectV2Type,
} from "@indieforge/contracts";
import {
  StudioProvider,
  useStudio,
} from "../components/studio/studio-provider";
import type { StudioMutation } from "../components/studio/studio-state";
import { recordingContext } from "./canvas-context";
import { SceneManager } from "../components/studio/scene-manager";
import { useStudioSelection } from "../components/studio/studio-selection";
import { GestureController } from "../components/studio/canvas/gesture-controller";

type Scene = EngineProjectV2Type["scenes"][number];
const id = (n: number) =>
  `550e8400-e29b-41d4-a716-${String(n).padStart(12, "0")}`;
function object(n: number, x = 40, y = 40): Scene["objects"][number] {
  return {
    id: id(n),
    name: `Object ${n}`,
    objectType: "UI",
    parentId: null,
    layerId: id(3),
    order: n,
    renderOrder: n,
    enabled: true,
    visible: true,
    locked: false,
    components: [
      {
        id: id(n + 100),
        type: "Transform",
        version: 1,
        properties: {
          ...(v2ComponentRegistry.Transform.defaults() as object),
          x,
          y,
          width: 40,
          height: 30,
        },
      },
      {
        id: id(n + 200),
        type: "UIPanel",
        version: 1,
        properties: v2ComponentRegistry.UIPanel.defaults(),
      },
    ],
  };
}
function project(objects = [object(10)]): EngineProjectV2Type {
  return EngineProjectV2.parse({
    schemaVersion: 2,
    projectId: id(1),
    engineFamily: "TFG_ENGINE",
    entrySceneId: id(2),
    settings: { viewport: { width: 640, height: 480 }, pixelArt: false },
    assetIds: [],
    scenes: [
      {
        id: id(2),
        key: "canvas",
        name: "Canvas",
        type: "MIXED",
        order: 0,
        width: 640,
        height: 480,
        background: { color: "#102030", assetId: null },
        settings: {
          gravityX: 0,
          gravityY: 0,
          grid: { enabled: false, size: 32, snap: false },
        },
        layers: [
          {
            id: id(3),
            name: "UI",
            type: "UI",
            order: 0,
            visible: true,
            locked: false,
          },
        ],
        objects,
      },
    ],
    variables: { global: [], player: [], scene: {} },
    prefabs: [],
    events: [],
    modules: [],
    scripts: [],
  });
}
let recorder: ReturnType<typeof recordingContext>;
beforeEach(() => {
  sessionStorage.clear();
  recorder = recordingContext();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    recorder.context,
  );
  vi.spyOn(
    HTMLCanvasElement.prototype,
    "getBoundingClientRect",
  ).mockReturnValue({
    left: 10,
    top: 20,
    width: 640,
    height: 480,
    right: 650,
    bottom: 500,
    x: 10,
    y: 20,
    toJSON() {},
  });
  class Pointer extends MouseEvent {
    pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
    }
  }
  vi.stubGlobal("PointerEvent", Pointer);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function mount(
  document = project(),
  manager = false,
  beforeAcknowledgement?: Promise<void>,
  beforePersistence?: Promise<void>,
) {
  const modules = import.meta.glob(
    "../components/studio/canvas/scene-canvas.tsx",
  );
  expect(modules, "Interactive canvas is not implemented").toHaveProperty([
    "../components/studio/canvas/scene-canvas.tsx",
  ]);
  const { SceneCanvas } = (await modules[
    "../components/studio/canvas/scene-canvas.tsx"
  ]()) as typeof import("../components/studio/canvas/scene-canvas");
  let studio!: ReturnType<typeof useStudio>;
  let renders = 0;
  const batches: StudioMutation[][] = [];
  let server = structuredClone(document);
  function Content() {
    const current = useStudio();
    const [sceneIndex, setSceneIndex] = useState(0);
    const { selectObject } = useStudioSelection();
    renders++;
    useEffect(() => {
      studio = current;
    });
    return (
      <>
        <input aria-label="Other input" />
        <div
          contentEditable
          suppressContentEditableWarning
          aria-label="Editable"
        >
          edit
        </div>
        <button
          onClick={() =>
            selectObject(current.state.document.scenes[sceneIndex].id, id(11))
          }
        >
          Hierarchy select
        </button>
        <button onClick={() => setSceneIndex(1)}>Switch scene</button>
        {manager && (
          <SceneManager
            sceneId={current.state.document.scenes[sceneIndex].id}
            onSceneChange={() => {}}
          />
        )}
        <SceneCanvas scene={current.state.document.scenes[sceneIndex]} />
      </>
    );
  }
  const result = render(
    <StudioProvider
      identity={{
        userId: "owner",
        gameId: "game",
        projectId: document.projectId,
      }}
      initial={{ revision: 0, document }}
      storage={{
        read: async () => null,
        write: async () => {
          await beforePersistence;
        },
      }}
      debounceMs={30}
      transport={async (_game, batch) => {
        batches.push(structuredClone(batch.mutations));
        await beforeAcknowledgement;
        server = applyProjectMutations(server, batch.mutations);
        return { document: server, revision: batch.baseRevision + 1 };
      }}
    >
      <Content />
    </StudioProvider>,
  );
  await waitFor(() => expect(studio.state.ready).toBe(true));
  await act(async () => {});
  const canvas = () => screen.getByRole("img", { name: /^Cảnh:/ });
  return {
    ...result,
    canvas,
    batches,
    get studio() {
      return studio;
    },
    get renders() {
      return renders;
    },
    get server() {
      return server;
    },
  };
}
function pointer(
  element: HTMLElement,
  phase: "down" | "move" | "up",
  x: number,
  y: number,
  pointerId = 1,
) {
  fireEvent(
    element,
    new PointerEvent(`pointer${phase}`, {
      bubbles: true,
      pointerId,
      clientX: x + 10,
      clientY: y + 20,
      button: 0,
    }),
  );
}
function clickCanvas(canvas: HTMLElement, x = 50, y = 50) {
  pointer(canvas, "down", x, y);
  pointer(canvas, "up", x, y);
}
function transform(studio: ReturnType<typeof useStudio>, objectId = id(10)) {
  return studio.state.document.scenes[0].objects.find((o) => o.id === objectId)!
    .components[0].properties;
}
async function frame() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 25));
  });
}

test("selects the top stable ID independently of storage order and does not commit a click", async () => {
  const lower = object(11),
    upper = object(10);
  upper.renderOrder = 100;
  const app = await mount(project([upper, lower]));
  clickCanvas(app.canvas());
  expect(app.canvas()).toHaveAttribute("data-selected-object-id", id(10));
  expect(app.studio.state.history.past).toHaveLength(0);
  expect(app.batches).toHaveLength(0);
});

test("clicking an unsnapped object with snap enabled does not change its position or history", async () => {
  const doc = project();
  doc.scenes[0].settings.grid.snap = true;
  const app = await mount(doc);
  clickCanvas(app.canvas());
  expect(transform(app.studio)).toMatchObject({ x: 40, y: 40 });
  expect(app.studio.state.history.past).toHaveLength(0);
});

test("pointer preview draws locally without canonical history, recovery version, transport or parent rerenders; drop saves one Transform update", async () => {
  const app = await mount();
  const original = structuredClone(app.studio.state.document);
  pointer(app.canvas(), "down", 50, 50);
  const renders = app.renders,
    version = app.studio.state.version;
  recorder.calls.length = 0;
  for (let x = 51; x <= 82; x++) pointer(app.canvas(), "move", x, 66);
  await frame();
  expect(
    recorder.calls.some(
      (call) =>
        call.name === "transform" && call.args[4] === 72 && call.args[5] === 56,
    ),
  ).toBe(true);
  expect(app.studio.state.document).toEqual(original);
  expect(app.studio.state.preview).toBeNull();
  expect(app.studio.state.history.past).toHaveLength(0);
  expect(app.studio.state.version).toBe(version);
  expect(app.renders).toBe(renders);
  expect(app.batches).toHaveLength(0);
  pointer(app.canvas(), "up", 82, 66);
  expect(transform(app.studio)).toMatchObject({
    x: 72,
    y: 56,
    width: 40,
    height: 30,
    pivot: { x: 0.5, y: 0.5 },
  });
  expect(app.studio.state.history.past).toHaveLength(1);
  await waitFor(() => expect(app.batches).toHaveLength(1));
  expect(app.batches[0]).toEqual([
    {
      type: "component.update",
      sceneId: id(2),
      objectId: id(10),
      componentId: id(110),
      properties: transform(app.studio),
    },
  ]);
});

test("idle pointer hover does not redraw or rerender the Studio", async () => {
  const app = await mount();
  await frame();
  recorder.calls.length = 0;
  const renders = app.renders;
  pointer(app.canvas(), "move", 60, 60);
  await frame();
  expect(recorder.calls).toHaveLength(0);
  expect(app.renders).toBe(renders);
});

test("recovery persistence status without a visual change does not redraw the canvas", async () => {
  let persist!: () => void;
  const pending = new Promise<void>((resolve) => {
    persist = resolve;
  });
  const app = await mount(project(), false, undefined, pending);
  await frame();
  recorder.calls.length = 0;
  const renders = app.renders;
  expect(app.studio.state.persistedVersion).toBe(-1);
  await act(async () => {
    persist();
  });
  await waitFor(() =>
    expect(app.studio.state.persistedVersion).toBe(app.studio.state.version),
  );
  await frame();
  expect(app.renders).toBeGreaterThan(renders);
  expect(recorder.calls).toHaveLength(0);
});

test("a save acknowledgement with an equal Scene does not cancel the next active drag", async () => {
  let acknowledge!: () => void;
  const pending = new Promise<void>((resolve) => {
    acknowledge = resolve;
  });
  const app = await mount(project(), false, pending);
  pointer(app.canvas(), "down", 50, 50);
  pointer(app.canvas(), "up", 60, 50);
  pointer(app.canvas(), "down", 65, 50);
  pointer(app.canvas(), "move", 85, 50);
  await waitFor(() => expect(app.batches).toHaveLength(1));
  await act(async () => {
    acknowledge();
  });
  await waitFor(() => expect(app.studio.state.status).toBe("SAVED"));
  pointer(app.canvas(), "up", 90, 50);
  expect(transform(app.studio)).toMatchObject({ x: 75, y: 40 });
  expect(app.studio.state.history.past).toHaveLength(2);
});

test("a real canonical lock change cancels a drag before it can commit stale geometry", async () => {
  const app = await mount();
  pointer(app.canvas(), "down", 50, 50);
  pointer(app.canvas(), "move", 85, 50);
  act(() =>
    app.studio.dispatch({
      type: "commit",
      mutations: [
        {
          type: "object.update",
          sceneId: id(2),
          objectId: id(10),
          changes: { locked: true },
        },
      ],
    }),
  );
  pointer(app.canvas(), "up", 90, 50);
  expect(transform(app.studio)).toMatchObject({ x: 40, y: 40 });
  expect(app.studio.state.history.past).toHaveLength(1);
});

test("moves a rotated scaled parent's child in local coordinates using inverse parent world", async () => {
  const parent = object(11, 240, 40);
  parent.objectType = "GROUP";
  parent.components.splice(1);
  Object.assign(parent.components[0].properties, {
    rotation: 90,
    scaleX: 2,
    scaleY: -1,
    pivot: { x: 0, y: 0 },
  });
  const child = object(10, 10, 20);
  child.parentId = parent.id;
  const app = await mount(project([child, parent]));
  pointer(app.canvas(), "down", 270, 80);
  pointer(app.canvas(), "move", 302, 96);
  pointer(app.canvas(), "up", 302, 96);
  expect(transform(app.studio)).toMatchObject({ x: 18, y: 52 });
});

test.each(["locked", "visible", "enabled"] as const)(
  "excludes %s objects from direct selection and manipulation",
  async (field) => {
    const excluded = object(11);
    excluded[field] = field === "locked";
    const app = await mount(project([excluded]));
    clickCanvas(app.canvas());
    expect(app.canvas()).not.toHaveAttribute("data-selected-object-id");
    fireEvent.keyDown(app.canvas(), { key: "Delete" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(app.studio.state.history.past).toHaveLength(0);
  },
);

test("hierarchy can highlight locked IDs but canvas cannot resize, drag or delete them", async () => {
  const locked = object(11);
  locked.locked = true;
  const app = await mount(project([locked]));
  fireEvent.click(screen.getByText("Hierarchy select"));
  expect(app.canvas()).toHaveAttribute("data-selected-object-id", id(11));
  expect(
    screen.queryByRole("button", { name: "Đổi kích thước" }),
  ).not.toBeInTheDocument();
  fireEvent.keyDown(app.canvas(), { key: "Delete" });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  pointer(app.canvas(), "down", 50, 50);
  pointer(app.canvas(), "move", 90, 80);
  pointer(app.canvas(), "up", 90, 80);
  expect(app.studio.state.history.past).toHaveLength(0);
});

test("hierarchy selection of a numerically collapsed world transform exposes no unusable size handle", async () => {
  const parent = object(12, 0, 0);
  parent.objectType = "GROUP";
  parent.components.splice(1);
  Object.assign(parent.components[0].properties, {
    scaleX: 1e-200,
    scaleY: 1e-200,
  });
  const child = object(11, 0, 0);
  child.parentId = parent.id;
  Object.assign(child.components[0].properties, {
    scaleX: 1e-200,
    scaleY: 1e-200,
  });
  await mount(project([child, parent]));
  fireEvent.click(screen.getByRole("button", { name: "Hierarchy select" }));
  expect(
    screen.queryByRole("button", { name: "Đổi kích thước" }),
  ).not.toBeInTheDocument();
});

test("grid toolbar uses canonical settings and snap rounds world placement in its own gesture", async () => {
  const app = await mount();
  recorder.calls.length = 0;
  fireEvent.click(screen.getByRole("button", { name: "Hiện lưới" }));
  await frame();
  expect(recorder.calls.some((call) => call.name === "lineTo")).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Bám lưới" }));
  pointer(app.canvas(), "down", 50, 50);
  pointer(app.canvas(), "move", 75, 90);
  pointer(app.canvas(), "up", 75, 90);
  expect(transform(app.studio)).toMatchObject({ x: 64, y: 96 });
  expect(app.studio.state.document.scenes[0].settings.grid).toEqual({
    enabled: true,
    size: 32,
    snap: true,
  });
  expect(app.studio.state.history.past).toHaveLength(3);
});

test("Scene Manager and canvas grid stay synchronized through settings edits, undo and server reload", async () => {
  const app = await mount(project(), true);
  fireEvent.click(screen.getByRole("button", { name: "Hiện lưới" }));
  expect(screen.getByRole("checkbox", { name: "Bật lưới" })).toBeChecked();
  fireEvent.click(screen.getByRole("checkbox", { name: "Bám lưới" }));
  fireEvent.change(
    screen.getByRole("spinbutton", { name: "Kích thước lưới" }),
    { target: { value: "16" } },
  );
  fireEvent.click(screen.getByRole("button", { name: "Lưu Cảnh" }));
  expect(screen.getByRole("button", { name: "Bám lưới" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  fireEvent.keyDown(app.canvas(), { key: "z", ctrlKey: true });
  expect(screen.getByRole("button", { name: "Bám lưới" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  expect(
    screen.getByRole("spinbutton", { name: "Kích thước lưới" }),
  ).toHaveValue(32);
  fireEvent.keyDown(app.canvas(), { key: "y", ctrlKey: true });
  await waitFor(() => expect(app.studio.state.status).toBe("SAVED"));
  const saved = structuredClone(app.server);
  app.unmount();
  const reloaded = await mount(saved, true);
  expect(screen.getByRole("button", { name: "Hiện lưới" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(screen.getByRole("button", { name: "Bám lưới" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(reloaded.studio.state.document.scenes[0].settings.grid.size).toBe(16);
});

test("resizes a supported panel once while preserving scale, rotation, pivot and its fixed opposite corner", async () => {
  const item = object(10);
  Object.assign(item.components[0].properties, { scaleX: 2, scaleY: 2 });
  const app = await mount(project([item]));
  clickCanvas(app.canvas());
  const handle = screen.getByRole("button", { name: "Đổi kích thước" });
  pointer(handle, "down", 100, 85);
  pointer(app.canvas(), "move", 140, 105);
  expect(transform(app.studio)).toMatchObject({ width: 40 });
  pointer(app.canvas(), "up", 140, 105);
  expect(transform(app.studio)).toMatchObject({
    x: 50,
    y: 45,
    width: 60,
    height: 40,
    scaleX: 2,
    scaleY: 2,
    rotation: 0,
    pivot: { x: 0.5, y: 0.5 },
  });
  expect(app.studio.state.history.past).toHaveLength(1);
});

test.each(["Custom", "Tilemap", "Collider"] as const)(
  "does not expose a dead resize handle for %s geometry",
  async (type) => {
    const item = object(10);
    item.components.push({
      id: id(300),
      type,
      version: 1,
      properties: v2ComponentRegistry[type].defaults(),
    });
    if (type === "Tilemap") item.objectType = "TILEMAP";
    const doc = project();
    doc.scenes[0].layers[0].type = "WORLD";
    item.components[1] = {
      id: id(210),
      type: "SpriteRenderer",
      version: 1,
      properties: v2ComponentRegistry.SpriteRenderer.defaults(),
    };
    doc.scenes[0].objects = [item];
    const app = await mount(EngineProjectV2.parse(doc));
    clickCanvas(app.canvas());
    expect(app.canvas()).toHaveAttribute("data-selected-object-id", id(10));
    expect(
      screen.queryByRole("button", { name: "Đổi kích thước" }),
    ).not.toBeInTheDocument();
  },
);

test("resize handle supports keyboard arrows with one history entry", async () => {
  const app = await mount();
  clickCanvas(app.canvas());
  fireEvent.keyDown(screen.getByRole("button", { name: "Đổi kích thước" }), {
    key: "ArrowRight",
    shiftKey: true,
  });
  expect(transform(app.studio)).toMatchObject({ width: 50, height: 30 });
  expect(app.studio.state.history.past).toHaveLength(1);
});

test.each([
  [true, 64, 96, "ArrowRight", 96, 96, 384, 96],
  [true, 64, 96, "ArrowLeft", 32, 96, 1, 96],
  [true, 64, 96, "ArrowDown", 64, 128, 64, 416],
  [true, 64, 96, "ArrowUp", 64, 64, 64, 1],
  [true, 40, 30, "ArrowRight", 64, 30, 352, 30],
  [true, 40, 30, "ArrowLeft", 32, 30, 1, 30],
  [true, 40, 30, "ArrowDown", 40, 32, 40, 320],
  [true, 40, 30, "ArrowUp", 40, 1, 40, 1],
  [false, 40, 30, "ArrowRight", 41, 30, 50, 30],
  [false, 40, 30, "ArrowLeft", 39, 30, 30, 30],
  [false, 40, 30, "ArrowDown", 40, 31, 40, 40],
  [false, 40, 30, "ArrowUp", 40, 29, 40, 20],
] as const)(
  "directional keyboard resize snap=%s from %s×%s with %s preserves the untouched axis, Shift and history",
  async (
    snap,
    width,
    height,
    key,
    nextWidth,
    nextHeight,
    shiftWidth,
    shiftHeight,
  ) => {
    const doc = project();
    doc.scenes[0].settings.grid.snap = snap;
    Object.assign(doc.scenes[0].objects[0].components[0].properties, {
      width,
      height,
    });
    const app = await mount(doc);
    clickCanvas(app.canvas());
    const handle = screen.getByRole("button", { name: "Đổi kích thước" });
    handle.focus();
    const original = transform(app.studio);
    fireEvent.keyDown(handle, { key });
    expect(transform(app.studio)).toEqual({
      ...original,
      width: nextWidth,
      height: nextHeight,
    });
    expect(app.studio.state.history.past).toHaveLength(1);
    expect(handle).toHaveFocus();
    fireEvent.keyDown(handle, { key: "z", ctrlKey: true });
    expect(transform(app.studio)).toEqual(original);
    fireEvent.keyDown(handle, { key: "y", ctrlKey: true });
    expect(transform(app.studio)).toEqual({
      ...original,
      width: nextWidth,
      height: nextHeight,
    });
    fireEvent.keyDown(handle, { key: "z", ctrlKey: true });
    fireEvent.keyDown(handle, { key, shiftKey: true });
    expect(transform(app.studio)).toEqual({
      ...original,
      width: shiftWidth,
      height: shiftHeight,
    });
    expect(app.studio.state.history.past).toHaveLength(1);
    expect(app.studio.state.history.future).toHaveLength(0);
    expect(handle).toHaveFocus();
  },
);

test.each([1, 0.5])(
  "directional keyboard resize respects minimum %s without changing the other subpixel dimension",
  async (width) => {
    const doc = project();
    doc.scenes[0].settings.grid.snap = true;
    Object.assign(doc.scenes[0].objects[0].components[0].properties, {
      width,
      height: 0.75,
    });
    const app = await mount(doc);
    pointer(app.canvas(), "down", 40.25, 40.25);
    pointer(app.canvas(), "up", 40.25, 40.25);
    const handle = screen.getByRole("button", { name: "Đổi kích thước" });
    const before = app.studio.state.document;
    for (const key of ["ArrowLeft", "ArrowUp"])
      for (const shiftKey of [false, true])
        fireEvent.keyDown(handle, { key, shiftKey });
    expect(app.studio.state.document).toBe(before);
    expect(app.studio.state.history.past).toHaveLength(0);
    expect(app.batches).toHaveLength(0);
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(transform(app.studio)).toMatchObject({ width: 32, height: 0.75 });
  },
);

test("directional keyboard resize rejects schema overflow without history or autosave", async () => {
  const doc = project();
  doc.scenes[0].settings.grid.snap = true;
  // A left pivot keeps this very wide, scaled object inside the viewport.
  Object.assign(doc.scenes[0].objects[0].components[0].properties, {
    width: 65536,
    scaleX: 0.001,
    pivot: { x: 0, y: 0 },
  });
  const app = await mount(doc);
  clickCanvas(app.canvas());
  const handle = screen.getByRole("button", { name: "Đổi kích thước" });
  const before = app.studio.state.document;
  fireEvent.keyDown(handle, { key: "ArrowRight" });
  fireEvent.keyDown(handle, { key: "ArrowRight", shiftKey: true });
  expect(app.studio.state.document).toBe(before);
  expect(app.studio.state.history.past).toHaveLength(0);
  expect(app.batches).toHaveLength(0);
});

test.each([NaN, Infinity, -Infinity])(
  "directional keyboard resize rejects nonfinite local step %s",
  (step) => {
    const scene = project().scenes[0];
    const controller = new GestureController();
    const list = buildRenderList(scene);
    expect(
      controller.begin(scene, list, id(10), { x: 0, y: 0 }, -1, true),
    ).toBe(true);
    controller.resizeBy({ x: step, y: 0 }, -1, true, 32);
    expect(controller.previewList(list)).toBe(list);
    expect(controller.finish(-1)).toBeNull();
  },
);

test("directional keyboard resize preserves a custom pivot under a rotated negative-scale parent", async () => {
  const parent = object(11, 200, 120);
  parent.objectType = "GROUP";
  parent.components.splice(1);
  Object.assign(parent.components[0].properties, {
    rotation: 90,
    scaleX: 2,
    scaleY: -1,
    pivot: { x: 0, y: 0 },
  });
  const child = object(10, 10, 20);
  child.parentId = parent.id;
  Object.assign(child.components[0].properties, {
    rotation: 90,
    scaleX: -2,
    scaleY: 1,
    pivot: { x: 0.25, y: 0.75 },
  });
  const doc = project([child, parent]);
  doc.scenes[0].settings.grid.snap = true;
  const app = await mount(doc);
  clickCanvas(app.canvas(), 222.5, 175);
  const handle = screen.getByRole("button", { name: "Đổi kích thước" });
  fireEvent.keyDown(handle, { key: "ArrowRight" });
  const resized = transform(app.studio);
  expect(resized).toMatchObject({
    width: 64,
    height: 30,
    rotation: 90,
    scaleX: -2,
    scaleY: 1,
    pivot: { x: 0.25, y: 0.75 },
  });
  expect(resized.x).toBeCloseTo(4);
  expect(resized.y).toBeCloseTo(8);
  expect(transform(app.studio, parent.id)).toEqual(
    parent.components[0].properties,
  );
  fireEvent.keyDown(handle, { key: "z", ctrlKey: true });
  expect(app.studio.state.document).toEqual(doc);
});

test("directional keyboard resize saves exactly one typed mutation per accepted key and no minimum no-op", async () => {
  const doc = project();
  doc.scenes[0].settings.grid.snap = true;
  const app = await mount(doc);
  clickCanvas(app.canvas());
  const handle = screen.getByRole("button", { name: "Đổi kích thước" });
  for (const [index, width] of [64, 96, 128].entries()) {
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    await waitFor(() => expect(app.batches).toHaveLength(index + 1));
    expect(app.batches[index]).toEqual([
      {
        type: "component.update",
        sceneId: id(2),
        objectId: id(10),
        componentId: id(110),
        properties: {
          ...doc.scenes[0].objects[0].components[0].properties,
          width,
        },
      },
    ]);
    expect(app.studio.state.history.past).toHaveLength(index + 1);
  }
  fireEvent.keyDown(handle, { key: "ArrowUp" });
  await waitFor(() => expect(app.batches).toHaveLength(4));
  const before = app.studio.state.document;
  fireEvent.keyDown(handle, { key: "ArrowUp" });
  await frame();
  expect(app.studio.state.document).toBe(before);
  expect(app.studio.state.history.past).toHaveLength(4);
  expect(app.batches).toHaveLength(4);
});

test.each(["space", "tool"])(
  "pans with %s and changes no canonical data",
  async (mode) => {
    const app = await mount();
    if (mode === "space")
      fireEvent.keyDown(app.canvas(), { key: " ", code: "Space" });
    else
      fireEvent.click(
        screen.getByRole("button", { name: "Di chuyển khung nhìn" }),
      );
    pointer(app.canvas(), "down", 300, 200);
    pointer(app.canvas(), "move", 340, 230);
    pointer(app.canvas(), "up", 340, 230);
    expect(app.canvas()).toHaveAttribute("data-camera-x", "-40");
    expect(app.canvas()).toHaveAttribute("data-camera-y", "-30");
    expect(app.studio.state.history.past).toHaveLength(0);
    fireEvent.keyUp(app.canvas(), { key: " ", code: "Space" });
  },
);

test("wheel and zoom buttons honor limits, preserve the pointer's world anchor and reset to fit", async () => {
  const app = await mount();
  fireEvent.wheel(app.canvas(), { deltaY: -100, clientX: 330, clientY: 260 });
  const zoom = Number(app.canvas().getAttribute("data-camera-zoom"));
  expect(zoom).toBeGreaterThan(1);
  expect(
    Number(app.canvas().getAttribute("data-camera-x")) + 320 / zoom,
  ).toBeCloseTo(320);
  for (let i = 0; i < 80; i++)
    fireEvent.click(screen.getByRole("button", { name: "Phóng to" }));
  expect(Number(app.canvas().getAttribute("data-camera-zoom"))).toBe(8);
  for (let i = 0; i < 100; i++)
    fireEvent.click(screen.getByRole("button", { name: "Thu nhỏ" }));
  expect(Number(app.canvas().getAttribute("data-camera-zoom"))).toBe(0.1);
  fireEvent.click(screen.getByRole("button", { name: "Vừa Cảnh" }));
  expect(app.canvas()).toHaveAttribute("data-camera-zoom", "1");
  expect(app.canvas()).toHaveAttribute("data-camera-x", "0");
  expect(app.studio.state.history.past).toHaveLength(0);
});

test.each([
  [64, 48, "Phóng to"],
  [65536, 65536, "Thu nhỏ"],
] as const)(
  "fit remains reachable for a %s × %s scene without reversing zoom direction",
  async (width, height, action) => {
    const doc = project([]);
    Object.assign(doc.scenes[0], { width, height });
    const app = await mount(doc);
    const initial = Number(app.canvas().getAttribute("data-camera-zoom"));
    fireEvent.click(screen.getByRole("button", { name: action }));
    const zoom = Number(app.canvas().getAttribute("data-camera-zoom"));
    if (action === "Phóng to") expect(zoom).toBeGreaterThanOrEqual(initial);
    else expect(zoom).toBeLessThanOrEqual(initial);
    fireEvent.click(screen.getByRole("button", { name: "Vừa Cảnh" }));
    expect(Number(app.canvas().getAttribute("data-camera-zoom"))).toBe(initial);
  },
);

test("Delete and Backspace require TFG confirmation and restore the exact object with keyboard undo/redo variants", async () => {
  const app = await mount();
  clickCanvas(app.canvas());
  fireEvent.keyDown(app.canvas(), { key: "Delete" });
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(app.studio.state.document.scenes[0].objects).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Hủy" }));
  fireEvent.keyDown(app.canvas(), { key: "Backspace" });
  fireEvent.click(screen.getByRole("button", { name: "Xác nhận xóa" }));
  expect(app.studio.state.document.scenes[0].objects).toHaveLength(0);
  expect(app.studio.state.history.past).toHaveLength(1);
  for (const [modifier, redo] of [
    ["ctrlKey", "y"],
    ["metaKey", "z"],
    ["ctrlKey", "z"],
  ] as const) {
    fireEvent.keyDown(app.canvas(), { key: "z", [modifier]: true });
    expect(app.studio.state.document.scenes[0].objects).toHaveLength(1);
    fireEvent.keyDown(app.canvas(), {
      key: redo,
      [modifier]: true,
      shiftKey: redo === "z",
    });
    expect(app.studio.state.document.scenes[0].objects).toHaveLength(0);
  }
});

test.each(["Escape", "pointercancel", "lostpointercapture", "blur"])(
  "%s cancels the preview without a drop commit",
  async (cancel) => {
    const app = await mount();
    pointer(app.canvas(), "down", 50, 50);
    pointer(app.canvas(), "move", 90, 90);
    if (cancel === "Escape") fireEvent.keyDown(app.canvas(), { key: cancel });
    else if (cancel === "blur") fireEvent(window, new Event("blur"));
    else
      fireEvent(
        app.canvas(),
        new PointerEvent(cancel, { bubbles: true, pointerId: 1 }),
      );
    pointer(app.canvas(), "up", 90, 90);
    expect(transform(app.studio)).toMatchObject({ x: 40, y: 40 });
    expect(app.studio.state.history.past).toHaveLength(0);
  },
);

test("ignores keyboard commands in fields, contenteditable, outside focus and composition", async () => {
  const app = await mount();
  clickCanvas(app.canvas());
  for (const target of [
    screen.getByLabelText("Other input"),
    screen.getByLabelText("Editable"),
    document.body,
  ]) {
    fireEvent.keyDown(target, { key: "Delete" });
    fireEvent.keyDown(target, { key: " ", code: "Space" });
    fireEvent.keyDown(target, { key: "z", ctrlKey: true });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  }
  fireEvent.keyDown(app.canvas(), { key: "Delete", isComposing: true });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  pointer(app.canvas(), "down", 50, 50);
  pointer(app.canvas(), "up", 60, 50);
  expect(transform(app.studio)).toMatchObject({ x: 50, y: 40 });
});

test("toolbar Space retains native button activation and composing resize keys do not edit", async () => {
  const app = await mount();
  clickCanvas(app.canvas());
  expect(
    fireEvent.keyDown(screen.getByRole("button", { name: "Hiện lưới" }), {
      key: " ",
    }),
  ).toBe(true);
  fireEvent.keyDown(screen.getByRole("button", { name: "Đổi kích thước" }), {
    key: "ArrowRight",
    isComposing: true,
  });
  expect(app.studio.state.history.past).toHaveLength(0);
});

test("rejects pointers outside viewport or scene and ignores unrelated pointer IDs", async () => {
  const item = object(10, -30, 40);
  const app = await mount(project([item]));
  clickCanvas(app.canvas(), -10, 50);
  expect(app.canvas()).not.toHaveAttribute("data-selected-object-id");
  clickCanvas(app.canvas(), 5, 50);
  pointer(app.canvas(), "down", 5, 50);
  pointer(app.canvas(), "move", 30, 80, 2);
  pointer(app.canvas(), "up", 30, 80, 2);
  pointer(app.canvas(), "up", 700, 80);
  expect(app.studio.state.history.past).toHaveLength(0);
});

test("scene switches and unmount discard pending previews, Space state and scheduled drawing", async () => {
  const doc = project();
  doc.scenes.push({
    ...structuredClone(doc.scenes[0]),
    id: id(4),
    key: "second",
    name: "Second",
    order: 1,
    layers: [{ ...doc.scenes[0].layers[0], id: id(5) }],
    objects: [],
  });
  const app = await mount(doc);
  pointer(app.canvas(), "down", 50, 50);
  pointer(app.canvas(), "move", 90, 90);
  fireEvent.click(screen.getByRole("button", { name: "Switch scene" }));
  pointer(app.canvas(), "up", 90, 90);
  expect(app.canvas()).not.toHaveAttribute("data-selected-object-id");
  expect(app.studio.state.history.past).toHaveLength(0);
  app.unmount();
  recorder.calls.length = 0;
  await frame();
  expect(recorder.calls).toHaveLength(0);
  expect(app.batches).toHaveLength(0);
});

test("a canvas first mounted at zero size initializes its camera when the viewport becomes visible", async () => {
  let resize!: ResizeObserverCallback;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: ResizeObserverCallback) {
        resize = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  const rect = vi.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect");
  rect.mockReturnValue({
    left: 10,
    top: 20,
    width: 0,
    height: 0,
    right: 10,
    bottom: 20,
    x: 10,
    y: 20,
    toJSON() {},
  });
  const app = await mount();
  rect.mockReturnValue({
    left: 10,
    top: 20,
    width: 640,
    height: 480,
    right: 650,
    bottom: 500,
    x: 10,
    y: 20,
    toJSON() {},
  });
  act(() => resize([], {} as ResizeObserver));
  expect(app.canvas()).toHaveAttribute("data-camera-zoom", "1");
  clickCanvas(app.canvas());
  expect(app.canvas()).toHaveAttribute("data-selected-object-id", id(10));
});

test("a rotated negative-scale resize preserves the custom pivot and fixed opposite corner", async () => {
  const item = object(10, 200, 120);
  Object.assign(item.components[0].properties, {
    rotation: 90,
    scaleX: -2,
    scaleY: 1,
    pivot: { x: 0.25, y: 0.75 },
  });
  const app = await mount(project([item]));
  clickCanvas(app.canvas(), 222.5, 122.5);
  const handle = screen.getByRole("button", { name: "Đổi kích thước" });
  pointer(handle, "down", 202.5, 82.5);
  pointer(app.canvas(), "move", 192.5, 42.5);
  pointer(app.canvas(), "up", 192.5, 42.5);
  const updated = transform(app.studio);
  expect(updated).toMatchObject({
    width: 60,
    height: 40,
    rotation: 90,
    scaleX: -2,
    scaleY: 1,
    pivot: { x: 0.25, y: 0.75 },
  });
  expect(updated.x).toBeCloseTo(187.5);
  expect(updated.y).toBeCloseTo(102.5);
});
