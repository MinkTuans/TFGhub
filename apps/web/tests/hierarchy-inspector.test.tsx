import { studioLabel, studioFieldLabel } from "../components/studio/studio-labels";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  applyProjectMutations,
  EngineProjectV2,
  v2ComponentRegistry,
  type EngineProjectV2Type,
  type GameSummary,
} from "@indieforge/contracts";
import {
  StudioProvider,
  useStudio,
} from "../components/studio/studio-provider";
import { StudioShell } from "../components/studio/studio-shell";
import { recordingContext } from "./canvas-context";
import type { RecoveryStorage } from "../components/studio/studio-recovery";
import type { StudioMutation } from "../components/studio/studio-state";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const id = (n: number) =>
  `550e8400-e29b-41d4-a716-${String(n).padStart(12, "0")}`;
type Scene = EngineProjectV2Type["scenes"][number];
function object(
  n: number,
  name: string,
  type: Scene["objects"][number]["objectType"] = "UI",
  x = 40,
  y = 40,
): Scene["objects"][number] {
  return {
    id: id(n),
    name,
    objectType: type,
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
      ...(type === "GROUP"
        ? []
        : [
            {
              id: id(n + 200),
              type: "UIPanel" as const,
              version: 1 as const,
              properties: v2ComponentRegistry.UIPanel.defaults(),
            },
          ]),
    ],
  };
}
function project(): EngineProjectV2Type {
  const group = object(10, "Group", "GROUP", 0, 0),
    child = object(11, "Child"),
    locked = object(12, "Locked", "UI", 120, 40);
  child.parentId = group.id;
  child.layerId = id(4);
  locked.locked = true;
  return EngineProjectV2.parse({
    schemaVersion: 2,
    projectId: id(1),
    engineFamily: "TFG_ENGINE",
    entrySceneId: id(2),
    settings: { viewport: { width: 640, height: 480 }, pixelArt: false },
    assetIds: [id(900)],
    scenes: [
      {
        id: id(2),
        key: "main",
        name: "Main",
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
            name: "World UI",
            type: "UI",
            order: 0,
            visible: true,
            locked: false,
          },
          {
            id: id(4),
            name: "Overlay",
            type: "UI",
            order: 1,
            visible: true,
            locked: false,
          },
        ],
        objects: [child, locked, group],
      },
      {
        id: id(5),
        key: "other",
        name: "Other",
        type: "MIXED",
        order: 1,
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
            id: id(6),
            name: "Other layer",
            type: "WORLD",
            order: 0,
            visible: true,
            locked: false,
          },
        ],
        objects: [],
      },
    ],
    variables: { global: [], player: [], scene: {} },
    prefabs: [],
    events: [],
    modules: [],
    scripts: [],
  });
}
const game = {
  id: "game",
  title: "Editor",
  sourceType: "ENGINE",
  reviewState: "DRAFT",
} as GameSummary;
beforeEach(() => {
  sessionStorage.clear();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    recordingContext().context,
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
    pointerId = 1;
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
  options: {
    storage?: RecoveryStorage;
    transport?: boolean;
    fixtures?: unknown[];
    beforeAcknowledgement?: Promise<void>;
  } = {},
) {
  let studio!: ReturnType<typeof useStudio>;
  let server = structuredClone(document);
  const batches: StudioMutation[][] = [];
  let stored: unknown = null;
  const storage = options.storage ?? {
    read: async () => stored,
    write: async (value: unknown) => {
      stored = structuredClone(value);
    },
  };
  function Observe() {
    const current = useStudio();
    useEffect(() => {
      studio = current;
    });
    return null;
  }
  const result = render(
    <StudioProvider
      identity={{
        userId: "owner",
        gameId: "game",
        projectId: document.projectId,
      }}
      initial={{ document, revision: 0 }}
      storage={storage}
      debounceMs={options.transport ? 20 : 60_000}
      transport={async (_game, batch) => {
        batches.push(structuredClone(batch.mutations));
        await options.beforeAcknowledgement;
        server = applyProjectMutations(server, batch.mutations);
        return { document: server, revision: batch.baseRevision + 1 };
      }}
    >
      <StudioShell initialGame={game} />
      <Observe />
    </StudioProvider>,
  );
  await waitFor(() => expect(studio.state.ready).toBe(true));
  return {
    ...result,
    storage,
    batches,
    get studio() {
      return studio;
    },
    get server() {
      return server;
    },
  };
}
const tree = () => screen.getByRole("tree", { name: "Đối tượng Cảnh" });
const row = (name: string) => within(tree()).getByRole("treeitem", { name });
const canvas = () => screen.getByRole("img", { name: /^Cảnh:/ });
function clickCanvas(x = 50, y = 50) {
  for (const phase of ["down", "up"])
    fireEvent(
      canvas(),
      new PointerEvent(`pointer${phase}`, {
        bubbles: true,
        clientX: x + 10,
        clientY: y + 20,
        button: 0,
      }),
    );
}
function select(name: string) {
  fireEvent.click(row(name));
}

test("canvas selection expands cross-layer ancestors, focuses the hierarchy row and drives inspector without document edits", async () => {
  const h = await mount();
  const before = h.studio.state.document;
  clickCanvas();
  expect(row("Group")).toHaveAttribute("aria-expanded", "true");
  expect(row("Child")).toHaveAttribute("aria-selected", "true");
  expect(row("Child")).toHaveFocus();
  expect(screen.getByRole("textbox", { name: "Tên đối tượng" })).toHaveValue(
    "Child",
  );
  expect(canvas()).toHaveAttribute("data-selected-object-id", id(11));
  expect(h.studio.state.document).toBe(before);
  expect(h.studio.state.history.past).toHaveLength(0);
});
test("hierarchy selects a locked object for inspection and highlights canvas while direct picking cannot", async () => {
  await mount();
  select("Locked");
  expect(canvas()).toHaveAttribute("data-selected-object-id", id(12));
  expect(screen.getByRole("textbox", { name: "Tên đối tượng" })).toHaveValue(
    "Locked",
  );
  expect(screen.queryByRole("button", { name: "Đổi kích thước" })).toBeNull();
  fireEvent.keyDown(row("Locked"), { key: "Enter" });
  expect(canvas()).toHaveFocus();
  clickCanvas(130, 50);
  expect(canvas()).not.toHaveAttribute("data-selected-object-id");
});

test("canvas reselecting the same object reopens a manually collapsed ancestor and returns focus", async () => {
  await mount();
  clickCanvas();
  fireEvent.click(screen.getByRole("button", { name: "Thu gọn Group" }));
  expect(within(tree()).queryByRole("treeitem", { name: "Child" })).toBeNull();
  clickCanvas();
  expect(row("Child")).toHaveFocus();
});
test("nested tree keyboard expansion uses parent links across layers, roving focus and no duplicate children", async () => {
  await mount();
  const group = row("Group");
  group.focus();
  fireEvent.keyDown(group, { key: "ArrowRight" });
  expect(group).toHaveAttribute("aria-expanded", "true");
  fireEvent.keyDown(group, { key: "ArrowRight" });
  expect(row("Child")).toHaveFocus();
  expect(row("Child")).toHaveAttribute("aria-level", "3");
  expect(
    within(tree()).getAllByRole("treeitem", { name: "Child" }),
  ).toHaveLength(1);
  fireEvent.keyDown(row("Child"), { key: "ArrowLeft" });
  expect(group).toHaveFocus();
  fireEvent.keyDown(group, { key: "ArrowLeft" });
  expect(group).toHaveAttribute("aria-expanded", "false");
  fireEvent.keyDown(group, { key: "End" });
  expect(row("Overlay")).toHaveFocus();
  fireEvent.keyDown(row("Overlay"), { key: "Home" });
  expect(row("World UI")).toHaveFocus();
});
test("selection survives canonical acknowledgement, reorder and remount with only IDs stored locally", async () => {
  const h = await mount(project(), { transport: true });
  select("Locked");
  fireEvent.change(screen.getByRole("textbox", { name: "Tên đối tượng" }), {
    target: { value: "Renamed" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Lưu đối tượng" }));
  await waitFor(() => expect(h.studio.state.status).toBe("SAVED"));
  expect(row("Renamed")).toHaveAttribute("aria-selected", "true");
  await act(async () =>
    h.studio.dispatch({
      type: "commit",
      mutations: [
        {
          type: "object.reorder",
          sceneId: id(2),
          layerId: id(3),
          orders: [
            { id: id(10), order: 12 },
            { id: id(12), order: 10 },
          ],
        },
      ],
    }),
  );
  expect(row("Renamed")).toHaveAttribute("aria-selected", "true");
  await waitFor(() => expect(h.studio.state.status).toBe("SAVED"));
  const saved = structuredClone(h.server);
  h.unmount();
  await mount(saved);
  expect(row("Renamed")).toHaveAttribute("aria-selected", "true");
  expect(canvas()).toHaveAttribute("data-selected-object-id", id(12));
  const values = Object.values(sessionStorage).join("");
  expect(values).not.toContain("Renamed");
  expect(values).not.toContain("components");
});
test("deleted selection falls back to scene and does not return on undo or a scene round trip", async () => {
  const h = await mount();
  clickCanvas();
  await act(async () =>
    h.studio.dispatch({
      type: "commit",
      mutations: [
        {
          type: "object.delete",
          sceneId: id(2),
          objectIds: [id(11)],
          confirmed: true,
        },
      ],
    }),
  );
  expect(canvas()).not.toHaveAttribute("data-selected-object-id");
  expect(screen.queryByRole("textbox", { name: "Tên đối tượng" })).toBeNull();
  await act(async () => h.studio.dispatch({ type: "undo" }));
  expect(canvas()).not.toHaveAttribute("data-selected-object-id");
  select("Locked");
  fireEvent.change(screen.getByRole("combobox", { name: "Cảnh hiện tại" }), {
    target: { value: id(5) },
  });
  expect(canvas()).not.toHaveAttribute("data-selected-object-id");
  fireEvent.change(screen.getByRole("combobox", { name: "Cảnh hiện tại" }), {
    target: { value: id(2) },
  });
  expect(canvas()).not.toHaveAttribute("data-selected-object-id");
});
test("layer reorder, visibility and lock are canonical undoable operations and inherited across parent layers", async () => {
  const h = await mount();
  select("Group");
  fireEvent.click(screen.getByRole("button", { name: "Đưa World UI xuống" }));
  expect(
    h.studio.state.document.scenes[0].layers.find((l) => l.id === id(3))?.order,
  ).toBe(1);
  fireEvent.click(screen.getByRole("button", { name: "Khóa World UI" }));
  clickCanvas();
  expect(canvas()).not.toHaveAttribute("data-selected-object-id");
  fireEvent.click(screen.getByRole("button", { name: "Ẩn World UI" }));
  select("Group");
  expect(screen.getByRole("textbox", { name: "Tên đối tượng" })).toHaveValue(
    "Group",
  );
  expect(row("Group")).toHaveAttribute("data-effective-visible", "false");
  fireEvent.keyDown(row("Group"), { key: "ArrowRight" });
  expect(row("Child")).toHaveAttribute("data-effective-visible", "false");
  expect(row("Child")).toHaveAttribute("data-effective-locked", "true");
  expect(row("Child")).toHaveAccessibleDescription("Đang ẩn · Đã khóa");
  await act(async () => h.studio.dispatch({ type: "undo" }));
  expect(
    h.studio.state.document.scenes[0].layers.find((l) => l.id === id(3))
      ?.visible,
  ).toBe(true);
});
test("schema-driven fields edit complete components and invalid coupled values preserve document/history", async () => {
  const document = project();
  document.scenes[0].objects[0].components.push({
    id: id(400),
    type: "Health",
    version: 1,
    properties: v2ComponentRegistry.Health.defaults(),
  });
  const h = await mount(document);
  clickCanvas();
  const health = screen.getByRole("group", { name: "Sức khỏe" });
  expect(within(health).getByText("Phiên bản 1")).toBeVisible();
  fireEvent.change(
    within(health).getByRole("spinbutton", { name: "Hiện tại" }),
    { target: { value: "120" } },
  );
  fireEvent.click(within(health).getByRole("button", { name: "Lưu Sức khỏe" }));
  expect(within(health).getByRole("alert")).toHaveTextContent(
    "Sức khỏe hiện tại không được vượt quá mức tối đa.",
  );
  expect(h.studio.state.history.past).toHaveLength(0);
  fireEvent.change(
    within(health).getByRole("spinbutton", { name: "Tối đa" }),
    { target: { value: "150" } },
  );
  fireEvent.click(within(health).getByRole("button", { name: "Lưu Sức khỏe" }));
  expect(
    h.studio.state.document.scenes[0].objects[0].components.at(-1)?.properties,
  ).toEqual({ current: 120, maximum: 150 });
  expect(h.studio.state.history.past).toHaveLength(1);
  await act(async () => h.studio.dispatch({ type: "undo" }));
  expect(
    within(screen.getByRole("group", { name: "Sức khỏe" })).getByRole(
      "spinbutton",
      { name: "Hiện tại" },
    ),
  ).toHaveValue(100);
});
test("registry add/defaults, discriminated fields, nullable references and JSON fields retain validation authority", async () => {
  const h = await mount();
  select("Locked");
  fireEvent.change(screen.getByRole("combobox", { name: "Thêm thành phần" }), {
    target: { value: "Collider" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Thêm thành phần" }));
  const collider = screen.getByRole("group", { name: "Vùng va chạm" });
  expect(
    within(collider).getByRole("spinbutton", { name: "Chiều rộng" }),
  ).toHaveValue(32);
  fireEvent.change(within(collider).getByRole("combobox", { name: "Hình dạng" }), {
    target: { value: "CIRCLE" },
  });
  expect(
    within(collider).queryByRole("spinbutton", { name: "Chiều rộng" }),
  ).toBeNull();
  fireEvent.change(
    within(collider).getByRole("spinbutton", { name: "Bán kính" }),
    { target: { value: "24" } },
  );
  fireEvent.click(
    within(collider).getByRole("button", { name: "Lưu Vùng va chạm" }),
  );
  expect(
    h.studio.state.document.scenes[0].objects
      .find((o) => o.id === id(12))!
      .components.at(-1)?.properties,
  ).toEqual({
    shape: "CIRCLE",
    radius: 24,
    offsetX: 0,
    offsetY: 0,
    isTrigger: false,
    collisionLayerId: null,
  });
  const savedCollider = screen.getByRole("group", { name: "Vùng va chạm" });
  fireEvent.change(
    within(savedCollider).getByRole("textbox", { name: "Mã lớp va chạm" }),
    { target: { value: id(4) } },
  );
  const before = h.studio.state.document;
  fireEvent.click(
    within(savedCollider).getByRole("button", { name: "Lưu Vùng va chạm" }),
  );
  expect(screen.getByRole("alert")).toHaveTextContent(/phải tham chiếu một lớp va chạm/);
  expect(h.studio.state.document).toBe(before);
});
test("typed object edits validate parent cycles atomically and pending component edits recover through existing storage", async () => {
  const h = await mount();
  select("Group");
  fireEvent.change(screen.getByRole("textbox", { name: "Tên đối tượng" }), {
    target: { value: "Invalid rename" },
  });
  fireEvent.change(screen.getByRole("combobox", { name: "Đối tượng cha" }), {
    target: { value: id(11) },
  });
  fireEvent.click(screen.getByRole("button", { name: "Lưu đối tượng" }));
  expect(screen.getByRole("alert")).toBeVisible();
  expect(h.studio.state.history.past).toHaveLength(0);
  clickCanvas();
  const transform = screen.getByRole("group", { name: "Biến đổi" });
  fireEvent.change(
    within(transform).getByRole("spinbutton", { name: "Góc xoay" }),
    { target: { value: "45" } },
  );
  fireEvent.click(
    within(transform).getByRole("button", { name: "Lưu Biến đổi" }),
  );
  await waitFor(() =>
    expect(h.studio.state.persistedVersion).toBe(h.studio.state.version),
  );
  h.unmount();
  const restored = await mount(project(), { storage: h.storage });
  expect(
    restored.studio.state.document.scenes[0].objects[0].components[0]
      .properties,
  ).toMatchObject({ rotation: 45 });
  expect(screen.getByRole("textbox", { name: "Tên đối tượng" })).toHaveValue(
    "Child",
  );
});

test("moving an object to an occupied layer appends its order and undo restores exact membership", async () => {
  const document = project();
  document.scenes[0].objects[0].order = 10;
  const h = await mount(document);
  clickCanvas();
  fireEvent.change(screen.getByRole("combobox", { name: "Lớp đối tượng" }), {
    target: { value: id(3) },
  });
  fireEvent.click(screen.getByRole("button", { name: "Lưu đối tượng" }));
  expect(h.studio.state.document.scenes[0].objects[0]).toMatchObject({
    id: id(11),
    layerId: id(3),
    order: 13,
    parentId: id(10),
  });
  expect(canvas()).toHaveAttribute("data-selected-object-id", id(11));
  await act(async () => h.studio.dispatch({ type: "undo" }));
  expect(h.studio.state.document).toEqual(document);
});

test("JSON component drafts reject invalid data, reset visibly to registry defaults and remove through history", async () => {
  const h = await mount();
  select("Locked");
  fireEvent.change(screen.getByRole("combobox", { name: "Thêm thành phần" }), {
    target: { value: "Custom" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Thêm thành phần" }));
  const custom = screen.getByRole("group", { name: "Tùy chỉnh" });
  const config = within(custom).getByRole("textbox", { name: "Cấu hình" });
  fireEvent.change(config, { target: { value: "{broken" } });
  const before = h.studio.state.document;
  fireEvent.click(within(custom).getByRole("button", { name: "Lưu Tùy chỉnh" }));
  expect(within(custom).getByRole("alert")).toBeVisible();
  expect(h.studio.state.document).toBe(before);
  fireEvent.click(
    within(custom).getByRole("button", { name: "Mặc định Tùy chỉnh" }),
  );
  expect(within(custom).getByRole("textbox", { name: "Cấu hình" })).toHaveValue(
    "{}",
  );
  fireEvent.change(within(custom).getByRole("textbox", { name: "Cấu hình" }), {
    target: { value: '{"effect":{"color":"blue"}}' },
  });
  fireEvent.click(within(custom).getByRole("button", { name: "Lưu Tùy chỉnh" }));
  expect(
    h.studio.state.document.scenes[0].objects
      .find((o) => o.id === id(12))!
      .components.at(-1)?.properties,
  ).toEqual({
    definitionKey: "custom.component",
    config: { effect: { color: "blue" } },
  });
  fireEvent.click(
    within(screen.getByRole("group", { name: "Tùy chỉnh" })).getByRole("button", {
      name: "Gỡ Tùy chỉnh",
    }),
  );
  expect(screen.queryByRole("group", { name: "Tùy chỉnh" })).toBeNull();
  await act(async () => h.studio.dispatch({ type: "undo" }));
  expect(
    within(screen.getByRole("group", { name: "Tùy chỉnh" })).getByRole("textbox", {
      name: "Cấu hình",
    }),
  ).toHaveValue(JSON.stringify({ effect: { color: "blue" } }, null, 2));
});

test("successful property saves preserve keyboard focus on the save control", async () => {
  await mount();
  clickCanvas();
  const component = screen.getByRole("group", { name: "Biến đổi" });
  fireEvent.change(
    within(component).getByRole("spinbutton", { name: "Góc xoay" }),
    { target: { value: "20" } },
  );
  const save = within(component).getByRole("button", { name: "Lưu Biến đổi" });
  save.focus();
  fireEvent.click(save);
  expect(screen.getByRole("button", { name: "Lưu Biến đổi" })).toHaveFocus();
  fireEvent.change(screen.getByRole("textbox", { name: "Tên đối tượng" }), {
    target: { value: "Keyboard item" },
  });
  const objectSave = screen.getByRole("button", { name: "Lưu đối tượng" });
  objectSave.focus();
  fireEvent.click(objectSave);
  expect(screen.getByRole("button", { name: "Lưu đối tượng" })).toHaveFocus();
});

test("hierarchy focus retains canvas undo shortcuts with editable-field guards", async () => {
  const h = await mount();
  clickCanvas();
  await act(async () =>
    h.studio.dispatch({
      type: "commit",
      mutations: [
        {
          type: "object.update",
          sceneId: id(2),
          objectId: id(11),
          changes: { name: "Changed" },
        },
      ],
    }),
  );
  row("Changed").focus();
  fireEvent.keyDown(row("Changed"), { key: "z", ctrlKey: true });
  expect(screen.getByRole("textbox", { name: "Tên đối tượng" })).toHaveValue(
    "Child",
  );
  fireEvent.keyDown(row("Child"), { key: "z", ctrlKey: true, shiftKey: true });
  expect(screen.getByRole("textbox", { name: "Tên đối tượng" })).toHaveValue(
    "Changed",
  );
  fireEvent.keyDown(screen.getByRole("textbox", { name: "Tên đối tượng" }), {
    key: "z",
    ctrlKey: true,
  });
  expect(h.studio.state.document.scenes[0].objects[0].name).toBe("Changed");
});

test.each(["ctrlKey", "metaKey"])(
  "resize-handle %s undo/redo runs once while other button keys stay native",
  async (modifier) => {
    const h = await mount();
    clickCanvas();
    expect(row("Child")).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "Enter" });
    expect(canvas()).toHaveFocus();
    // jsdom has no native Tab navigation; the official browser case tabs here.
    const handle = screen.getByRole("button", { name: "Đổi kích thước" });
    handle.focus();
    const width = () => screen.getByRole("spinbutton", { name: "Chiều rộng" });
    fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
    fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
    expect(width()).toHaveValue(42);
    expect(h.studio.state.history.past).toHaveLength(2);
    expect(
      fireEvent.keyDown(document.activeElement!, {
        key: "z",
        [modifier]: true,
      }),
    ).toBe(false);
    expect(width()).toHaveValue(41);
    expect(h.studio.state.history.past).toHaveLength(1);
    expect(h.studio.state.history.future).toHaveLength(1);
    fireEvent.keyDown(document.activeElement!, {
      key: "Z",
      [modifier]: true,
      shiftKey: true,
    });
    expect(width()).toHaveValue(42);
    fireEvent.keyDown(document.activeElement!, { key: "z", [modifier]: true });
    fireEvent.keyDown(document.activeElement!, { key: "y", [modifier]: true });
    expect(width()).toHaveValue(42);
    const before = h.studio.state.document;
    for (const key of ["Delete", "Backspace", "Escape", " ", "Enter", "z"]) {
      expect(fireEvent.keyDown(handle, { key })).toBe(true);
    }
    expect(
      fireEvent.keyDown(handle, {
        key: "z",
        [modifier]: true,
        isComposing: true,
      }),
    ).toBe(true);
    expect(
      fireEvent.keyDown(handle, {
        key: "z",
        [modifier]: true,
        altKey: true,
      }),
    ).toBe(true);
    expect(handle).toHaveFocus();
    expect(canvas()).toHaveAttribute("data-selected-object-id", id(11));
    expect(screen.queryByRole("dialog")).toBeNull();
    const save = screen.getByRole("button", { name: "Lưu đối tượng" });
    save.focus();
    for (const key of ["z", "y", "Delete", "Backspace", "Escape", " "]) {
      expect(
        fireEvent.keyDown(save, {
          key,
          [modifier]: ["z", "y"].includes(key),
        }),
      ).toBe(true);
    }
    expect(h.studio.state.document).toBe(before);
    expect(h.studio.state.history.past).toHaveLength(2);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(canvas()).toHaveAttribute("data-selected-object-id", id(11));
  },
);

test.each(["Delete", "Backspace"])(
  "tree-focused %s retains the canvas confirmation and locked/hidden guards",
  async (key) => {
    const h = await mount();
    clickCanvas();
    expect(row("Child")).toHaveFocus();
    expect(fireEvent.keyDown(document.activeElement!, { key })).toBe(false);
    const dialog = screen.getByRole("dialog", { name: /Xóa “Child”/ });
    expect(h.studio.state.history.past).toHaveLength(0);
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(canvas()).toHaveAttribute("data-selected-object-id", id(11));
    select("Locked");
    fireEvent.keyDown(document.activeElement!, { key });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Ẩn World UI" }));
    select("Child");
    fireEvent.keyDown(document.activeElement!, { key });
    expect(screen.queryByRole("dialog")).toBeNull();
  },
);

test.each([
  ["canvas", "root"],
  ["tree", "root"],
  ["canvas", "descendant"],
  ["tree", "descendant"],
] as const)(
  "%s confirmed delete rejects a referenced %s without losing Studio state and can cancel, fix and retry",
  async (surface, reference) => {
    const doc = project();
    const target = doc.scenes[0].objects.find((item) => item.id === id(10))!;
    // Give the subtree root visible geometry so both canvas and tree can pick it.
    target.components.push({
      id: id(410),
      type: "UIPanel",
      version: 1,
      properties: v2ComponentRegistry.UIPanel.defaults(),
    });
    doc.scenes[0].layers.push({
      id: id(9),
      name: "Camera layer",
      type: "WORLD",
      order: 2,
      visible: true,
      locked: false,
    });
    const source = doc.scenes[0].objects.find((item) => item.id === id(12))!;
    source.layerId = id(9);
    source.objectType = "GROUP";
    source.components.splice(1);
    source.components.push({
      id: id(400),
      type: "Camera",
      version: 1,
      properties: {
        followObjectId: reference === "root" ? id(10) : id(11),
        bounds: null,
        smoothing: 0,
      },
    });
    const h = await mount(EngineProjectV2.parse(doc), {
      transport: true,
      beforeAcknowledgement: new Promise<void>(() => {}),
    });
    const nativeConfirm = vi.spyOn(window, "confirm");
    const nativeAlert = vi.spyOn(window, "alert");
    // Keep actual pending work and redo history, so rejection cannot silently reset them.
    for (const name of ["Pending one", "Pending two"])
      await act(async () =>
        h.studio.dispatch({
          type: "commit",
          mutations: [
            {
              type: "object.update",
              sceneId: id(2),
              objectId: id(12),
              changes: { name },
            },
          ],
        }),
      );
    await act(async () => h.studio.dispatch({ type: "undo" }));
    await waitFor(() => expect(h.batches).toHaveLength(1));
    expect(h.studio.state.pending).not.toBeNull();
    const openDelete = () => {
      if (surface === "canvas") {
        clickCanvas(10, 10);
        fireEvent.keyDown(document.activeElement!, { key: "Enter" });
        expect(canvas()).toHaveFocus();
      } else {
        select("Group");
        expect(row("Group")).toHaveFocus();
      }
      fireEvent.keyDown(document.activeElement!, { key: "Delete" });
      return screen.getByRole("dialog", { name: /Xóa “Group”/ });
    };
    const before = h.studio.state;
    let dialog = openDelete();
    const selectedPreference = { ...sessionStorage };
    const confirm = within(dialog).getByRole("button", {
      name: "Xác nhận xóa",
    });
    expect(within(dialog).getByRole("button", { name: "Hủy" })).toHaveFocus();
    confirm.focus();
    fireEvent.click(confirm);
    expect(screen.getByRole("dialog")).toBe(dialog);
    expect(within(dialog).getByRole("alert")).toHaveTextContent(/tham chiếu/i);
    expect(confirm).toHaveFocus();
    expect(h.studio.state.document).toBe(before.document);
    expect(h.studio.state.history).toBe(before.history);
    expect(h.studio.state.pending).toBe(before.pending);
    expect(h.studio.state.queued).toBe(before.queued);
    expect(h.studio.state.version).toBe(before.version);
    expect(canvas()).toHaveAttribute("data-selected-object-id", id(10));
    expect({ ...sessionStorage }).toEqual(selectedPreference);
    expect(h.batches).toHaveLength(1);
    fireEvent.click(confirm); // A retry still rejects without consuming history.
    expect(h.studio.state.history).toBe(before.history);
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(surface === "canvas" ? canvas() : row("Group")).toHaveFocus();
    expect(canvas()).toHaveAttribute("data-selected-object-id", id(10));
    select("Pending one");
    const camera = screen.getByRole("group", { name: "Máy quay" });
    fireEvent.change(
      within(camera).getByRole("textbox", { name: "Mã đối tượng theo dõi" }),
      { target: { value: "" } },
    );
    fireEvent.click(within(camera).getByRole("button", { name: "Lưu Máy quay" }));
    const fixed = h.studio.state.document;
    const historyLength = h.studio.state.history.past.length;
    dialog = openDelete();
    expect(within(dialog).queryByRole("alert")).toBeNull();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Xác nhận xóa" }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      h.studio.state.document.scenes[0].objects.map((item) => item.id),
    ).toEqual([id(12)]);
    expect(h.studio.state.history.past).toHaveLength(historyLength + 1);
    expect(canvas()).not.toHaveAttribute("data-selected-object-id");
    await act(async () => h.studio.dispatch({ type: "undo" }));
    expect(h.studio.state.document).toEqual(fixed);
    expect(nativeConfirm).not.toHaveBeenCalled();
    expect(nativeAlert).not.toHaveBeenCalled();
  },
);

test("tree-focused Escape clears selection without changing canonical data", async () => {
  const h = await mount();
  clickCanvas();
  expect(row("Child")).toHaveFocus();
  expect(fireEvent.keyDown(document.activeElement!, { key: "Escape" })).toBe(
    false,
  );
  expect(canvas()).not.toHaveAttribute("data-selected-object-id");
  expect(h.studio.state.history.past).toHaveLength(0);
});

test.each(["canvas", "tree"])(
  "%s confirmed delete uses canonical event reference rejection",
  async (surface) => {
    const doc = project();
    doc.events.push({
      id: id(500),
      version: 1,
      name: "Click child",
      enabled: true,
      order: 0,
      trigger: { type: "ON_CLICK", objectId: id(11) },
      condition: null,
      steps: [{ id: id(501), version: 1, type: "COMPLETE_GAME" }],
    });
    const h = await mount(EngineProjectV2.parse(doc));
    clickCanvas();
    if (surface === "canvas")
      fireEvent.keyDown(document.activeElement!, { key: "Enter" });
    const before = h.studio.state;
    fireEvent.keyDown(document.activeElement!, { key: "Delete" });
    const dialog = screen.getByRole("dialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Xác nhận xóa" }),
    );
    expect(within(dialog).getByRole("alert")).toHaveTextContent(/tham chiếu/i);
    expect(h.studio.state.document).toBe(before.document);
    expect(h.studio.state.history).toBe(before.history);
    expect(h.studio.state.pending).toBe(before.pending);
    expect(h.studio.state.queued).toBe(before.queued);
    expect(canvas()).toHaveAttribute("data-selected-object-id", id(11));
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(surface === "canvas" ? canvas() : row("Child")).toHaveFocus();
  },
);

test("tree-focused held Space pans without moving objects or handing focus back, and blur releases Space", async () => {
  const h = await mount();
  clickCanvas();
  const before = h.studio.state.document;
  expect(row("Child")).toHaveFocus();
  expect(fireEvent.keyDown(document.activeElement!, { key: " " })).toBe(false);
  fireEvent.pointerDown(canvas(), { button: 0, clientX: 60, clientY: 70 });
  fireEvent.pointerMove(canvas(), { clientX: 90, clientY: 90 });
  fireEvent.pointerUp(canvas(), { clientX: 90, clientY: 90 });
  expect(canvas()).toHaveFocus();
  expect(canvas()).toHaveAttribute("data-camera-x", "-30");
  expect(h.studio.state.document).toBe(before);
  fireEvent.blur(window);
  fireEvent.click(screen.getByRole("button", { name: "Vừa Cảnh" }));
  clickCanvas();
  fireEvent.pointerDown(canvas(), { button: 0, clientX: 60, clientY: 70 });
  fireEvent.pointerMove(canvas(), { clientX: 90, clientY: 90 });
  fireEvent.pointerUp(canvas(), { clientX: 90, clientY: 90 });
  expect(h.studio.state.history.past).toHaveLength(1);
  expect(
    h.studio.state.document.scenes[0].objects[0].components[0].properties,
  ).toMatchObject({ x: 70, y: 60 });
});

test("editor shortcuts ignore controls, composing events and targets outside their Studio", async () => {
  const h = await mount();
  clickCanvas();
  const before = h.studio.state.document;
  const editable = document.createElement("div");
  editable.setAttribute("contenteditable", "true");
  row("Child").append(editable);
  const targets = [
    screen.getByRole("textbox", { name: "Tên đối tượng" }),
    screen.getByRole("combobox", { name: "Đối tượng cha" }),
    screen.getByRole("button", { name: "Chọn đối tượng" }),
    editable,
    document.body,
  ];
  for (const target of targets) {
    for (const key of ["Delete", "Backspace", "Escape", " ", "z"]) {
      expect(fireEvent.keyDown(target, { key, ctrlKey: key === "z" })).toBe(
        true,
      );
    }
  }
  fireEvent.keyDown(row("Child"), { key: "Delete", isComposing: true });
  fireEvent.keyDown(row("Child"), { key: "Escape", altKey: true });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(canvas()).toHaveAttribute("data-selected-object-id", id(11));
  expect(h.studio.state.document).toBe(before);
  editable.remove();
});

test("keyboard deletion and undo affect only the focused Studio once", async () => {
  const first = await mount(),
    second = await mount();
  const firstCanvas = within(first.container).getByRole("img", {
    name: /^Cảnh:/,
  });
  fireEvent.pointerDown(firstCanvas, { button: 0, clientX: 60, clientY: 70 });
  fireEvent.pointerUp(firstCanvas, { clientX: 60, clientY: 70 });
  fireEvent.keyDown(document.activeElement!, { key: "Delete" });
  const dialog = within(first.container).getByRole("dialog", {
    name: /Xóa “Child”/,
  });
  expect(within(second.container).queryByRole("dialog")).toBeNull();
  fireEvent.click(within(dialog).getByRole("button", { name: "Xác nhận xóa" }));
  expect(first.studio.state.document.scenes[0].objects).toHaveLength(2);
  const group = within(first.container).getByRole("treeitem", {
    name: "Group",
  });
  fireEvent.click(group);
  fireEvent.keyDown(document.activeElement!, { key: "z", ctrlKey: true });
  expect(first.studio.state.document).toEqual(project());
  expect(first.studio.state.history.future).toHaveLength(1);
  expect(second.studio.state.history.past).toHaveLength(0);
  expect(second.studio.state.document).toEqual(project());
});

test.each([
  { type: "InventoryItem" as const, field: "description", max: 2000 },
  { type: "Text" as const, field: "text", max: 5000 },
])(
  "$type strings retain canonical newlines, blank values, validation and save focus through undo/reload",
  async ({ type, field, max }) => {
    const initial = project(),
      original = "First line\nSecond line\n",
      edited = "Edited first\nEdited second\n";
    initial.scenes[0].objects[0].components.push({
      id: id(700),
      type,
      version: 1,
      properties: {
        ...(v2ComponentRegistry[type].defaults() as object),
        [field]: original,
      },
    });
    const h = await mount(initial, { transport: true });
    clickCanvas();
    const group = screen.getByRole("group", { name: studioLabel(type) });
    const control = () => within(group).getByRole("textbox", { name: studioFieldLabel(field) });
    expect(control()).toHaveValue(original);
    fireEvent.change(control(), { target: { value: edited } });
    const save = within(group).getByRole("button", {
      name: `Lưu ${studioLabel(type)}`,
    });
    save.focus();
    fireEvent.click(save);
    expect(save).toHaveFocus();
    await waitFor(() => expect(h.studio.state.status).toBe("SAVED"));
    expect(
      h.server.scenes[0].objects[0].components.at(-1)?.properties,
    ).toMatchObject({ [field]: edited });
    fireEvent.change(control(), { target: { value: "x".repeat(max + 1) } });
    fireEvent.click(save);
    expect(within(group).getByRole("alert")).toBeVisible();
    expect(h.studio.state.history.past).toHaveLength(1);
    fireEvent.change(control(), { target: { value: "" } });
    fireEvent.click(save);
    expect(
      h.studio.state.document.scenes[0].objects[0].components.at(-1)
        ?.properties,
    ).toMatchObject({ [field]: "" });
    await act(async () => h.studio.dispatch({ type: "undo" }));
    expect(control()).toHaveValue(edited);
    await waitFor(() => expect(h.studio.state.status).toBe("SAVED"));
    const saved = structuredClone(h.server);
    h.unmount();
    await mount(saved);
    expect(screen.getByRole("textbox", { name: studioFieldLabel(field) })).toHaveValue(edited);
  },
);

test("a real canvas drop uses its current camera and selected group, then selects, undoes and saves the created object", async () => {
  const { SceneCanvas } =
    await import("../components/studio/canvas/scene-canvas");
  const { HierarchyPanel } =
    await import("../components/studio/hierarchy-panel");
  const { PropertyInspector } =
    await import("../components/studio/property-inspector");
  const { STUDIO_ASSET_MIME } = await dropModule();
  let studio!: ReturnType<typeof useStudio>;
  function Content() {
    const value = useStudio();
    useEffect(() => {
      studio = value;
    });
    const scene = value.state.document.scenes[0];
    return (
      <>
        <HierarchyPanel scene={scene} />
        <SceneCanvas scene={scene} assetMetadata={[metadata()]} />
        <PropertyInspector scene={scene} />
      </>
    );
  }
  render(
    <StudioProvider
      identity={{ userId: "owner", gameId: "game", projectId: id(1) }}
      initial={{ document: project(), revision: 0 }}
      storage={{ read: async () => null, write: async () => {} }}
      debounceMs={60_000}
    >
      <Content />
    </StudioProvider>,
  );
  await waitFor(() => expect(studio.state.ready).toBe(true));
  select("Group");
  fireEvent.click(screen.getByRole("button", { name: "Phóng to" }));
  const dataTransfer = {
    types: [STUDIO_ASSET_MIME],
    getData: (type: string) =>
      type === STUDIO_ASSET_MIME
        ? JSON.stringify({ assetId: id(900), kind: "IMAGE", role: "ITEM" })
        : "",
  };
  const event = new MouseEvent("drop", {
    bubbles: true,
    cancelable: true,
    clientX: 330,
    clientY: 260,
  });
  Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
  fireEvent(canvas(), event);
  expect(studio.state.document.scenes[0].objects).toHaveLength(4);
  const created = studio.state.document.scenes[0].objects.find(
    (o) => o.name === "Fixture",
  )!;
  expect(created.parentId).toBe(id(10));
  expect(created.components[0].properties).toMatchObject({ x: 320, y: 240 });
  expect(row("Fixture")).toHaveAttribute("aria-selected", "true");
  expect(canvas()).toHaveAttribute("data-selected-object-id", created.id);
  expect(studio.state.history.past).toHaveLength(1);
  await act(async () => studio.dispatch({ type: "undo" }));
  expect(studio.state.document.scenes[0].objects).toHaveLength(3);
});

async function dropModule() {
  const modules = import.meta.glob("../components/studio/asset-drop.ts");
  expect(modules, "Asset drop boundary is not implemented").toHaveProperty([
    "../components/studio/asset-drop.ts",
  ]);
  return (await modules[
    "../components/studio/asset-drop.ts"
  ]()) as typeof import("../components/studio/asset-drop");
}
const metadata = () => ({
  id: id(900),
  projectId: id(1),
  state: "READY",
  kind: "IMAGE",
  displayName: "Fixture",
  width: 64,
  height: 32,
});
test.each(["IMAGE", "SPRITE", "ITEM", "UI"] as const)(
  "%s drop creates a role composition with stable asset IDs at world coordinates",
  async (role) => {
    const { createAssetDrop } = await dropModule();
    const document = project();
    let counter = 1000;
    const result = createAssetDrop({
      document,
      sceneId: id(2),
      layerId: id(3),
      parentId: null,
      payload: JSON.stringify({ assetId: id(900), kind: "IMAGE", role }),
      metadata: [metadata()],
      client: { x: 170, y: 140 },
      rect: { left: 10, top: 20, width: 640, height: 480 },
      camera: {
        x: 20,
        y: 30,
        zoom: 2,
        viewportWidth: 640,
        viewportHeight: 480,
      },
      newId: () => id(counter++),
    });
    const next = applyProjectMutations(document, result.mutations);
    const created = next.scenes[0].objects.find(
      (o) => o.id === result.objectId,
    )!;
    expect(created.objectType).toBe(
      role === "ITEM" ? "ITEM" : role === "UI" ? "UI" : "DECORATION",
    );
    expect(
      created.components.find((c) => c.type === "Transform")?.properties,
    ).toMatchObject({ x: 100, y: 90, width: 64, height: 32 });
    expect(created.components.map((c) => c.type)).toEqual(
      role === "UI"
        ? ["Transform", "UIPanel", "UIImage"]
        : role === "ITEM"
          ? ["Transform", "SpriteRenderer", "InventoryItem"]
          : ["Transform", "SpriteRenderer"],
    );
    expect(
      created.components.find(
        (c) => c.type === (role === "UI" ? "UIImage" : "SpriteRenderer"),
      )?.properties,
    ).toMatchObject({ assetId: id(900) });
    if (role === "ITEM")
      expect(
        created.components.find((c) => c.type === "InventoryItem")?.properties,
      ).toMatchObject({ iconAssetId: id(900) });
    expect(JSON.stringify(created)).not.toContain("READY");
    expect(JSON.stringify(created)).not.toContain("projectId");
    expect(document.scenes[0].objects).toHaveLength(3);
  },
);
test.each([
  null,
  { ...metadata(), state: "TOMBSTONED" },
  { ...metadata(), state: "UPLOADING" },
  { ...metadata(), projectId: id(9) },
  { ...metadata(), width: 0 },
  { ...metadata(), kind: "AUDIO" },
])(
  "drop rejects missing, tombstoned, foreign or invalid metadata atomically: %j",
  async (meta) => {
    const { createAssetDrop } = await dropModule();
    const document = project();
    expect(() =>
      createAssetDrop({
        document,
        sceneId: id(2),
        layerId: id(3),
        parentId: null,
        payload: JSON.stringify({
          assetId: id(900),
          kind: "IMAGE",
          role: "IMAGE",
        }),
        metadata: meta ? [meta] : [],
        client: { x: 50, y: 50 },
        rect: { left: 0, top: 0, width: 640, height: 480 },
        camera: {
          x: 0,
          y: 0,
          zoom: 1,
          viewportWidth: 640,
          viewportHeight: 480,
        },
      }),
    ).toThrow();
    expect(document.scenes[0].objects).toHaveLength(3);
  },
);
test.each([
  "{}",
  '{"assetId":"bad","kind":"IMAGE","role":"IMAGE"}',
  JSON.stringify({
    assetId: id(900),
    kind: "IMAGE",
    role: "IMAGE",
    url: "https://example.test/p.png",
  }),
  JSON.stringify({ assetId: id(901), kind: "IMAGE", role: "IMAGE" }),
  JSON.stringify({ assetId: id(900), kind: "IMAGE", role: "PLAYER" }),
])("drop rejects invalid payload %s", async (payload) => {
  const { createAssetDrop } = await dropModule();
  expect(() =>
    createAssetDrop({
      document: project(),
      sceneId: id(2),
      layerId: id(3),
      parentId: null,
      payload,
      metadata: [metadata()],
      client: { x: 50, y: 50 },
      rect: { left: 0, top: 0, width: 640, height: 480 },
      camera: { x: 0, y: 0, zoom: 1, viewportWidth: 640, viewportHeight: 480 },
    }),
  ).toThrow();
});
test("drop converts through rotated negative-scale parent and rejects locked/hidden or outside targets", async () => {
  const { createAssetDrop } = await dropModule();
  const document = project();
  const parent = document.scenes[0].objects.find((o) => o.id === id(10))!;
  Object.assign(parent.components[0].properties, {
    x: 200,
    y: 120,
    rotation: 90,
    scaleX: 2,
    scaleY: -1,
    pivot: { x: 0, y: 0 },
  });
  const options = {
    document,
    sceneId: id(2),
    layerId: id(4),
    parentId: id(10),
    payload: JSON.stringify({
      assetId: id(900),
      kind: "IMAGE",
      role: "IMAGE",
    }),
    metadata: [metadata()],
    client: { x: 220, y: 140 },
    rect: { left: 0, top: 0, width: 640, height: 480 },
    camera: { x: 0, y: 0, zoom: 1, viewportWidth: 640, viewportHeight: 480 },
  };
  const result = createAssetDrop(options);
  const next = applyProjectMutations(document, result.mutations);
  const created = next.scenes[0].objects.find((o) => o.id === result.objectId)!;
  expect(created.parentId).toBe(id(10));
  expect(created.components[0].properties).toMatchObject({ x: 10, y: 20 });
  parent.locked = true;
  expect(() => createAssetDrop(options)).toThrow();
  parent.locked = false;
  parent.visible = false;
  expect(() => createAssetDrop(options)).toThrow();
  parent.visible = true;
  expect(() =>
    createAssetDrop({ ...options, client: { x: -1, y: 20 } }),
  ).toThrow();
});

test("native browser drops READY fixtures, edits, undoes, autosaves and reloads exact canonical selection", async () => {
  const { createViteServer } = await import("vitest/node");
  const { chromium, expect: browserExpect } = await import("@playwright/test");
  const { existsSync } = await import("node:fs");
  const initial = project(),
    entry = "\0virtual:hierarchy-browser";
  const server = await createViteServer({
    configFile: false,
    // The recovery browser fixture starts another Vite server with different
    // defines. Do not let its optimizer replace this page's runtime chunks.
    cacheDir: "node_modules/.vite-hierarchy-inspector",
    logLevel: "error",
    server: { host: "127.0.0.1", port: 0 },
    define: {
      "process.env.NEXT_PUBLIC_API_URL": JSON.stringify("http://192.0.2.51"),
    },
    plugins: [
      {
        name: "hierarchy-browser-fixture",
        resolveId: (value) => (value === entry ? entry : undefined),
        load: (value) =>
          value === entry
            ? `
      import '/@vite/env';
      import { createElement as h, useEffect } from 'react';
      import { createRoot } from 'react-dom/client';
      import { StudioProvider, useStudio } from '/components/studio/studio-provider.tsx';
      import { HierarchyPanel } from '/components/studio/hierarchy-panel.tsx';
      import { PropertyInspector } from '/components/studio/property-inspector.tsx';
      import { SceneCanvas } from '/components/studio/canvas/scene-canvas.tsx';
      import '/components/studio/studio-shell.css';
      function Editor() {
        const studio = useStudio(), scene = studio.state.document.scenes[0];
        useEffect(() => { window.studio = studio; }, [studio]);
        return h('main', {className:'studio-shell'},
          h('div',null,
            h('button',{draggable:true,onDragStart:event => event.dataTransfer.setData('application/x-tfg-asset',${JSON.stringify(JSON.stringify({ assetId: id(900), kind: "IMAGE", role: "ITEM" }))})},'READY Fixture'),
            h('button',{onClick:()=>studio.dispatch({type:'undo'})},'Undo'),
            h('button',{onClick:()=>studio.dispatch({type:'redo'})},'Redo'),
            h('output',{'aria-label':'Save state'},studio.state.status)),
          h('div',{className:'studio-layout'},h(HierarchyPanel,{scene}),h(SceneCanvas,{scene,assetMetadata:${JSON.stringify([metadata()])}}),h('aside',{className:'studio-inspector'},h(PropertyInspector,{scene}))));
      }
      createRoot(document.getElementById('root')).render(h(StudioProvider,{identity:${JSON.stringify({ userId: "native-owner", gameId: "game", projectId: id(1) })},initial:${JSON.stringify({ document: initial, revision: 0 })}},h(Editor)));
    `
            : undefined,
        configureServer(vite) {
          vite.middlewares.use((request, response, next) => {
            if (request.url !== "/") return next();
            response.setHeader("Content-Type", "text/html");
            response.end(
              '<div id="root"></div><script type="module" src="/@id/__x00__virtual:hierarchy-browser"></script>',
            );
          });
        },
      },
    ],
  });
  await server.listen();
  const address = server.httpServer!.address();
  if (!address || typeof address === "string")
    throw new Error("Missing browser fixture address");
  const browser = await chromium.launch({
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ??
      (existsSync("/usr/bin/google-chrome")
        ? "/usr/bin/google-chrome"
        : undefined),
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
    });
    let canonical = structuredClone(initial),
      revision = 0;
    const batches: StudioMutation[][] = [],
      errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("requestfailed", (request) =>
      errors.push(`${request.url()}: ${request.failure()?.errorText}`),
    );
    await page.route("http://192.0.2.51/**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/games/game/engine-project/mutations") {
        const batch = route.request().postDataJSON();
        expect(batch.baseRevision).toBe(revision);
        canonical = applyProjectMutations(canonical, batch.mutations);
        revision++;
        batches.push(batch.mutations);
        await route.fulfill({
          status: 201,
          json: {
            status: "SUPPORTED",
            project: canonical,
            revision: {
              revisionNumber: revision,
              schemaVersion: 2,
              contentHash: "a".repeat(64),
              byteSize: 100,
              retention: "PINNED",
              createdAt: "2026-09-09T00:00:00.000Z",
            },
          },
        });
        return;
      }
      await route.fulfill({
        response: await route.fetch({
          url: `http://127.0.0.1:${address.port}${url.pathname}${url.search}`,
        }),
      });
    });
    await page.goto("http://192.0.2.51/");
    try {
      await browserExpect(
        page.getByRole("status", { name: "Save state" }),
      ).toHaveText("SAVED");
    } catch (error) {
      throw new Error(
        `${String(error)}\nBrowser diagnostics: ${errors.join("; ")}`,
      );
    }
    const canvas = page.getByRole("img", { name: "Cảnh: Main" }),
      group = page.getByRole("treeitem", { name: "Group", exact: true });
    const treeTop = await page
      .getByRole("tree", { name: "Đối tượng Cảnh" })
      .evaluate((element) => element.getBoundingClientRect().top);
    expect(treeTop).toBeLessThan(150);
    await group.click();
    await browserExpect(canvas).toHaveAttribute(
      "data-selected-object-id",
      id(10),
    );
    await group.press("Enter");
    await browserExpect(canvas).toBeFocused();
    await page
      .getByRole("button", { name: "READY Fixture" })
      .dragTo(canvas, { targetPosition: { x: 250, y: 170 } });
    await browserExpect(
      page.getByRole("textbox", { name: "Tên đối tượng" }),
    ).toHaveValue("Fixture");
    await browserExpect(
      page.getByRole("treeitem", { name: "Fixture", exact: true }),
    ).toBeFocused();
    const droppedId = await canvas.getAttribute("data-selected-object-id");
    expect(droppedId).toBeTruthy();
    await browserExpect(
      page.getByRole("status", { name: "Save state" }),
    ).toHaveText("SAVED");
    expect(batches).toHaveLength(1);
    expect(batches[0].map((command) => command.type)).toEqual([
      "object.create",
      "component.update",
      "component.update",
    ]);
    const dropped = canonical.scenes[0].objects.find(
      (object) => object.id === droppedId,
    )!;
    expect(dropped.parentId).toBe(id(10));
    const camera = await canvas.evaluate((element) => ({
      x: Number(element.dataset.cameraX),
      y: Number(element.dataset.cameraY),
      zoom: Number(element.dataset.cameraZoom),
    }));
    const transform = dropped.components[0].properties as {
      x: number;
      y: number;
    };
    expect(transform.x).toBeCloseTo(250 / camera.zoom + camera.x, 1);
    expect(transform.y).toBeCloseTo(170 / camera.zoom + camera.y, 1);
    await page
      .getByRole("textbox", { name: "Tên đối tượng" })
      .fill("Collected item");
    await page.getByRole("button", { name: "Lưu đối tượng" }).click();
    const item = page.getByRole("group", {
      name: "Vật phẩm",
      exact: true,
    });
    await item.getByRole("spinbutton", { name: "Số lượng tối đa" }).fill("7");
    await item
      .getByRole("button", { name: "Lưu Vật phẩm", exact: true })
      .click();
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await browserExpect(
      item.getByRole("spinbutton", { name: "Số lượng tối đa" }),
    ).toHaveValue("1");
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    await browserExpect(
      item.getByRole("spinbutton", { name: "Số lượng tối đa" }),
    ).toHaveValue("7");
    await browserExpect(
      page.getByRole("status", { name: "Save state" }),
    ).toHaveText("SAVED");
    const saved = structuredClone(canonical);
    await page.reload();
    await browserExpect(
      page.getByRole("status", { name: "Save state" }),
    ).toHaveText("SAVED");
    await browserExpect(
      page.getByRole("treeitem", { name: "Collected item", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await browserExpect(canvas).toHaveAttribute(
      "data-selected-object-id",
      droppedId!,
    );
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { studio: ReturnType<typeof useStudio> }).studio
            .state.document,
      ),
    ).toEqual(saved);
    expect(errors).toEqual([]);
    await page.screenshot({
      path: "../../.superpowers/sdd/2026-09-09-unified-game-studio/task-17-native.png",
      fullPage: true,
    });
  } finally {
    await browser.close();
    await server.close();
  }
}, 60_000);

test("Vietnamese component labels keep canonical enum and property values", async () => {
  const h = await mount();
  clickCanvas();
  fireEvent.change(screen.getByRole("combobox", { name: "Thêm thành phần" }), {
    target: { value: "Movement" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Thêm thành phần" }));
  const movement = screen.getByRole("group", { name: "Di chuyển" });
  const controls = within(movement).getByRole("combobox", { name: "Điều khiển" });
  expect(within(controls).getByRole("option", { name: "Người chơi" })).toHaveValue("PLAYER");
  fireEvent.change(controls, { target: { value: "PLAYER" } });
  fireEvent.click(within(movement).getByRole("button", { name: "Lưu Di chuyển" }));
  expect(h.studio.state.document.scenes[0].objects.find((object) => object.id === id(11))?.components.find((component) => component.type === "Movement")?.properties).toMatchObject({ controls: "PLAYER", initialDirection: "DOWN" });
});

test.each([
  ["InventoryItem", "displayName", "Item", "Vật phẩm"],
  ["UIButton", "label", "Button", "Nút"],
] as const)("%s preserves existing text until an explicit localized reset", async (type, field, existing, localized) => {
  const document = project();
  document.scenes[0].objects[0].components.push({
    id: id(990), type, version: 1,
    properties: { ...(v2ComponentRegistry[type].defaults() as object), [field]: existing },
  });
  const h = await mount(document);
  clickCanvas();
  const group = screen.getByRole("group", { name: studioLabel(type) });
  const input = () => within(group).getByRole("textbox", { name: studioFieldLabel(field) });
  expect(input()).toHaveValue(existing);
  fireEvent.click(within(group).getByRole("button", { name: `Mặc định ${studioLabel(type)}` }));
  expect(input()).toHaveValue(localized);
  expect(h.studio.state.document.scenes[0].objects[0].components.at(-1)?.properties)
    .toMatchObject({ [field]: existing });
  fireEvent.click(within(group).getByRole("button", { name: `Lưu ${studioLabel(type)}` }));
  expect(h.studio.state.document.scenes[0].objects[0].components.at(-1)?.properties)
    .toMatchObject({ [field]: localized });
  await act(async () => h.studio.dispatch({ type: "undo" }));
  expect(input()).toHaveValue(existing);
});
