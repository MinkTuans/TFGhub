"use client";

import { useEffect, useRef, useState } from "react";
import {
  EngineProjectV2,
  JSON_REQUEST_BYTE_LIMIT,
  UpdateGameInput,
  type EngineProjectV2Type,
  type GameSummary,
  type GameAssetSummary,
} from "@indieforge/contracts";
import { api, ApiError, resolvePublicApiBaseUrl } from "../../lib/api-client";
import { apiErrorMessage } from "../../lib/api-error-message";
import { createStudioId, useStudio } from "./studio-provider";
import { prepareStudioCommit } from "./studio-history";
import type { StudioMutation, StudioState } from "./studio-state";
import { addComponentCommand, createObjectCommand, removeComponentCommand } from "./object-commands";
import { studioValidationMessage } from "./component-editor";
import { StudioConfirmation } from "./studio-confirmation";

type Scene = EngineProjectV2Type["scenes"][number];
type Script = EngineProjectV2Type["scripts"][number];
export const studioTasks = [
  "Bắt đầu",
  "Thiết kế",
  "Tài nguyên",
  "Gameplay",
  "Code",
  "Chơi thử & xuất bản",
  "Hướng dẫn",
] as const;
export type StudioTask = (typeof studioTasks)[number];
export function isStudioSaved(state: StudioState) {
  return (
    state.ready &&
    !state.recoveryError &&
    !state.batchError &&
    !state.resolution &&
    !state.preview &&
    !state.pending &&
    !state.queued.length &&
    state.status === "SAVED" &&
    JSON.stringify(state.document) ===
      JSON.stringify(state.acknowledged.document)
  );
}
function useCanonicalCommit() {
  const { state, dispatch } = useStudio();
  const [error, setError] = useState("");
  const editable =
    state.ready &&
    !state.recoveryError &&
    !state.resolution &&
    !state.batchError;
  function commit(mutations: StudioMutation[]) {
    if (!editable) return false;
    try {
      prepareStudioCommit(state, mutations);
      dispatch({ type: "commit", mutations });
      setError("");
      return true;
    } catch (failure) {
      setError(studioValidationMessage(failure));
      return false;
    }
  }
  return { state, editable, commit, error, setError };
}
export function StudioStart({
  onTask,
}: {
  onTask: (task: StudioTask) => void;
}) {
  const { state } = useStudio();
  return (
    <section
      className="studio-task-panel studio-start"
      aria-label="Bắt đầu dự án"
    >
      <p className="studio-eyebrow">TFG PIXEL STUDIO</p>
      <h2>Thế giới nhỏ. Ý tưởng của bạn.</h2>
      <p>
        Tạo một trò chơi theo từng bước. Mọi thay đổi trong dự án được lưu tự
        động; chờ trạng thái “Đã lưu” trước khi chơi thử.
      </p>
      <div className="studio-start-cards">
        {(
          [
            [
              "01",
              "Thiết kế",
              "Xây thế giới",
              "Cảnh là một màn chơi. Thêm nhân vật, vật phẩm và trang trí; chọn đối tượng để chỉnh thuộc tính.",
            ],
            [
              "02",
              "Tài nguyên",
              "Mang hình ảnh của bạn vào",
              "Nhập ảnh hoặc âm thanh, sau đó đặt ảnh vào cảnh. Tài nguyên là những tệp trò chơi sử dụng.",
            ],
            [
              "03",
              "Gameplay",
              "Tạo luật chơi",
              "Dùng câu lệnh Khi… Thì… để tạo điểm số, hẹn giờ và điều kiện thắng mà không cần viết code.",
            ],
            [
              "04",
              "Code",
              "Thêm hành vi",
              "Dùng JavaScript để hiện lời chào, đổi biến hoặc chuyển cảnh. Có ví dụ sẵn để bắt đầu.",
            ],
            [
              "05",
              "Chơi thử & xuất bản",
              "Chơi, sửa, chia sẻ",
              "Tạo bản chơi thử từ phiên bản đã lưu, kiểm tra rồi gửi trò chơi để duyệt.",
            ],
          ] as const
        ).map(([number, task, title, body]) => (
          <button
            key={number}
            className="studio-start-card"
            onClick={() => onTask(task)}
          >
            <span>{number}</span>
            <strong>{title}</strong>
            <p>{body}</p>
          </button>
        ))}
      </div>
      <p>
        {state.document.scenes.length} cảnh ·{" "}
        {state.document.scenes.reduce(
          (sum, scene) => sum + scene.objects.length,
          0,
        )}{" "}
        đối tượng · {state.document.scripts.length} script
      </p>
      <button onClick={() => onTask("Hướng dẫn")}>
        Mở hướng dẫn từng bước
      </button>
      <StudioProjectFiles />
    </section>
  );
}
export function StudioProjectFiles() {
  const { state, editable, commit, error, setError } = useCanonicalCommit();
  const [message, setMessage] = useState("");
  async function importProject(file?: File) {
    if (!file) return;
    setMessage("");
    try {
      if (file.size > JSON_REQUEST_BYTE_LIMIT)
        throw new Error("Tệp JSON quá lớn (tối đa 4 MiB).");
      const imported = EngineProjectV2.parse(JSON.parse(await file.text()));
      const project = EngineProjectV2.parse({
        ...imported,
        projectId: state.identity.projectId,
      });
      for (const assetId of project.assetIds) {
        const asset = await api.get<GameAssetSummary>(
          `/games/${encodeURIComponent(state.identity.gameId)}/assets/${encodeURIComponent(assetId)}`,
        );
        if (
          asset.projectId !== state.identity.projectId ||
          asset.state !== "READY"
        )
          throw new Error(
            "Tài nguyên nhập không thuộc dự án này hoặc đã bị xóa.",
          );
      }
      if (commit([{ type: "project.replace", project }]))
        setMessage(
          "Đã nhập dự án vào bản nháp. Chờ xác nhận Đã lưu; máy chủ sẽ kiểm tra quyền sử dụng tài nguyên. Có thể Hoàn tác.",
        );
    } catch (failure) {
      setError(
        failure instanceof Error &&
          (failure.message.startsWith("Tệp JSON") ||
            failure.message.startsWith("Tài nguyên"))
          ? failure.message
          : failure instanceof ApiError
            ? `Không thể nhập tài nguyên: ${apiErrorMessage(failure, failure.message)}. Tệp tham chiếu phải thuộc dự án hiện tại.`
            : "JSON không hợp lệ hoặc không phải dự án Engine V2. Dự án hiện tại chưa thay đổi.",
      );
    }
  }
  function exportProject() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(state.document, null, 2)], {
        type: "application/json",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `pixel-project-${state.identity.projectId}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <section className="studio-project-files" aria-label="Tệp dự án">
      <h3>Sao lưu và nhập dự án</h3>
      <p>
        Nhập JSON thay thế nội dung dự án hiện tại; có thể Hoàn tác. JSON chứa
        cảnh, đối tượng và code. Ảnh/âm thanh vẫn thuộc dự án gốc; tải lại tệp
        của bạn khi chuyển sang dự án khác.
      </p>
      <div className="studio-task-actions">
        <button onClick={exportProject}>Xuất dự án JSON</button>
        <label className="studio-file-button">
          Nhập dự án JSON
          <input
            aria-label="Nhập dự án JSON"
            type="file"
            accept=".json,application/json"
            disabled={!editable}
            onChange={(event) => {
              void importProject(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </label>
      </div>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
export function StudioPresets({ scene }: { scene: Scene }) {
  const { editable, commit, error } = useCanonicalCommit();
  const layer = [...scene.layers]
    .sort((a, b) => b.order - a.order)
    .find((layer) => layer.type === "WORLD" && layer.visible && !layer.locked);
  return (
    <div className="studio-presets" aria-label="Thêm đối tượng nhanh">
      <span>Thêm vào cảnh:</span>
      {(
        [
          ["PLAYER", "Nhân vật"],
          ["ITEM", "Vật phẩm"],
          ["CUSTOM", "Kẻ địch"],
          ["DECORATION", "Trang trí"],
          ["NPC", "Nhân vật trò chuyện"],
          ["TILEMAP", "Bản đồ ô"],
        ] as const
      ).map(([objectType, name]) => (
        <button
          key={objectType}
          disabled={!editable || !layer}
          onClick={() => {
            if (layer) {
              const mutation = createObjectCommand(scene, {
                objectType,
                name: objectType === "CUSTOM" ? "Kẻ địch" : name,
                layerId: layer.id,
                transform: { x: scene.width / 2, y: scene.height / 2 },
              });
              const mutations = [mutation];
              if (objectType === "ITEM" && mutation.type === "object.create")
                mutations.push(
                  addComponentCommand(
                    scene.id,
                    mutation.objects[0].object.id,
                    "Collider",
                    {
                      shape: "RECTANGLE",
                      width: 32,
                      height: 32,
                      offsetX: 0,
                      offsetY: 0,
                      isTrigger: true,
                      collisionLayerId: null,
                    },
                  ),
                );
              if (objectType === "CUSTOM" && mutation.type === "object.create") {
                const objectId = mutation.objects[0].object.id;
                const custom = mutation.objects[0].object.components.find(
                  (component) => component.type === "Custom",
                );
                if (custom)
                  mutations.push(
                    removeComponentCommand(scene.id, objectId, custom.id),
                  );
                mutations.push(
                  addComponentCommand(scene.id, objectId, "SpriteRenderer"),
                  addComponentCommand(scene.id, objectId, "Collider"),
                  addComponentCommand(scene.id, objectId, "Health"),
                );
              }
              commit(mutations);
            }
          }}
        >
          {name}
        </button>
      ))}
      {!layer && (
        <span>Tạo hoặc mở khóa một lớp Thế giới để thêm đối tượng.</span>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
const capabilities: Script["capabilities"] = [
  "GET_VARIABLE",
  "SET_VARIABLE",
  "CHANGE_SCENE",
  "SPAWN_OBJECT",
  "PLAY_AUDIO",
  "SHOW_DIALOGUE",
];
const capabilityLabels = [
  "Đọc biến",
  "Ghi biến",
  "Chuyển cảnh",
  "Tạo đối tượng",
  "Phát âm thanh",
  "Hiện hội thoại",
];
const example = 'api.showDialogue("Chào mừng bạn đến thế giới của tôi!");';
export function StudioCode({ scene }: { scene: Scene }) {
  const { state, editable, commit, error, setError } = useCanonicalCommit();
  const [draft, setDraft] = useState<Script | null>(null);
  const [baseline, setBaseline] = useState("");
  const [switchTo, setSwitchTo] = useState<Script | null>(null);
  function loadDraft(next: Script) {
    setDraft(next);
    setBaseline(
      JSON.stringify(
        state.document.scripts.find((script) => script.id === next.id) ?? null,
      ),
    );
    setSwitchTo(null);
  }
  function requestDraft(next: Script) {
    if (draft && JSON.stringify(draft) !== baseline) setSwitchTo(next);
    else loadDraft(next);
  }
  useEffect(() => {
    if (!draft || JSON.stringify(draft) !== baseline) return;
    const current =
      state.document.scripts.find((script) => script.id === draft.id) ?? null;
    if (JSON.stringify(current) !== baseline) {
      setDraft(current);
      setBaseline(JSON.stringify(current));
    }
  }, [state.document.scripts, draft, baseline]);
  const [message, setMessage] = useState("");
  function newScript() {
    requestDraft({
      id: createStudioId(),
      version: 1,
      language: "JAVASCRIPT",
      name: "Lời chào",
      source: example,
      capabilities: ["SHOW_DIALOGUE"],
      attachments: [{ id: createStudioId(), type: "SCENE", sceneId: scene.id }],
    });
    setMessage("");
    setError("");
  }
  async function importScript(file?: File) {
    if (!file) return;
    try {
      if (!file.name.toLowerCase().endsWith(".js") || file.size > 100_000)
        throw new Error("Chọn tệp .js tối đa 100 KB.");
      const source = await file.text();
      requestDraft({
        id: createStudioId(),
        version: 1,
        language: "JAVASCRIPT",
        name: file.name.slice(0, 120),
        source,
        capabilities: [],
        attachments: [
          { id: createStudioId(), type: "SCENE", sceneId: scene.id },
        ],
      });
      setMessage("Đã đọc tệp. Chọn quyền API và nhấn Lưu script vào dự án.");
      setError("");
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Không thể đọc tệp.",
      );
    }
  }
  return (
    <section className="studio-task-panel" aria-label="Code JavaScript">
      <h2>Code · Hành vi của trò chơi</h2>
      <p>
        Viết phần thân JavaScript sử dụng <code>api</code>. Code chỉ chạy trong
        bản chơi thử, khi cảnh đính kèm bắt đầu. Lỗi cú pháp và lỗi chạy hiện
        trong trò chơi.
      </p>
      <div className="studio-task-actions">
        <button disabled={!editable} onClick={newScript}>
          Script mới
        </button>
        <label className="studio-file-button">
          Nhập .js
          <input
            type="file"
            accept=".js,text/javascript"
            aria-label="Nhập JavaScript"
            disabled={!editable}
            onChange={(event) => {
              void importScript(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </label>
      </div>
      <div className="studio-code-layout">
        <nav aria-label="Danh sách script">
          {state.document.scripts.length === 0 && (
            <p>Chưa có script. Bắt đầu với ví dụ lời chào.</p>
          )}
          {state.document.scripts.map((script) => (
            <button
              key={script.id}
              aria-pressed={draft?.id === script.id}
              onClick={() => {
                requestDraft(structuredClone(script));
                setMessage("");
              }}
            >
              {script.name}
            </button>
          ))}
        </nav>
        {draft && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (commit([{ type: "script.upsert", script: draft }])) {
                setBaseline(JSON.stringify(draft));
                setMessage(
                  "Đã đưa script vào dự án. Chờ Đã lưu, rồi tạo lại bản chơi thử.",
                );
              }
            }}
          >
            <fieldset disabled={!editable}>
              <legend>Chỉnh sửa script</legend>
              <label>
                Tên script
                <input
                  required
                  maxLength={120}
                  value={draft.name}
                  onChange={(event) =>
                    setDraft({ ...draft, name: event.target.value })
                  }
                />
              </label>
              <label>
                Mã JavaScript
                <textarea
                  spellCheck={false}
                  rows={16}
                  value={draft.source}
                  onChange={(event) => {
                    setDraft({ ...draft, source: event.target.value });
                    setMessage("");
                  }}
                />
              </label>
              <p>
                {new TextEncoder()
                  .encode(draft.source)
                  .byteLength.toLocaleString()}{" "}
                / 100.000 byte. Thay đổi trong ô này cần nhấn Lưu script.
              </p>
              <fieldset>
                <legend>Quyền API được phép sử dụng</legend>
                {capabilities.map((capability, index) => (
                  <label key={capability}>
                    <input
                      type="checkbox"
                      checked={draft.capabilities.includes(capability)}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          capabilities: event.target.checked
                            ? [...draft.capabilities, capability]
                            : draft.capabilities.filter(
                                (value) => value !== capability,
                              ),
                        })
                      }
                    />
                    {capabilityLabels[index]}
                  </label>
                ))}
              </fieldset>
              <fieldset>
                <legend>Chạy khi vào cảnh</legend>
                {state.document.scenes.map((item) => (
                  <label key={item.id}>
                    <input
                      type="checkbox"
                      checked={draft.attachments.some(
                        (a) => a.type === "SCENE" && a.sceneId === item.id,
                      )}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          attachments: event.target.checked
                            ? [
                                ...draft.attachments,
                                {
                                  id: createStudioId(),
                                  type: "SCENE",
                                  sceneId: item.id,
                                },
                              ]
                            : draft.attachments.filter(
                                (a) =>
                                  a.type !== "SCENE" || a.sceneId !== item.id,
                              ),
                        })
                      }
                    />
                    {item.name}
                  </label>
                ))}
              </fieldset>
              <button type="submit">Lưu script vào dự án</button>
              {state.document.scripts.some((s) => s.id === draft.id) && (
                <button
                  type="button"
                  onClick={() => {
                    if (
                      commit([{ type: "script.delete", scriptId: draft.id }])
                    ) {
                      setDraft(null);
                      setMessage("Đã xóa script. Có thể Hoàn tác.");
                    }
                  }}
                >
                  Xóa script
                </button>
              )}
            </fieldset>
          </form>
        )}
      </div>
      {switchTo && (
        <StudioConfirmation
          title="Script có thay đổi chưa lưu"
          confirmLabel="Bỏ bản sửa và chuyển"
          onCancel={() => setSwitchTo(null)}
          onConfirm={() => loadDraft(switchTo)}
        >
          <p>
            Nhấn Hủy để giữ bản sửa và Lưu script vào dự án trước khi chuyển.
          </p>
        </StudioConfirmation>
      )}
      <details>
        <summary>Ví dụ API</summary>
        <pre>{example}</pre>
        <p>
          Bật quyền Hiện hội thoại và đính kèm vào cảnh muốn chạy. Xem Hướng dẫn
          để đọc các API biến, chuyển cảnh, tạo đối tượng và âm thanh.
        </p>
      </details>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
export function StudioPlay({
  initialGame,
  onGameChange,
}: {
  initialGame: GameSummary;
  onGameChange?: (game: GameSummary) => void;
}) {
  const { state } = useStudio();
  const game = initialGame;
  function setGame(next: GameSummary) {
    onGameChange?.(next);
  }
  const [description, setDescription] = useState(initialGame.description);
  const [accessMode, setAccessMode] = useState(initialGame.accessMode);
  const [built, setBuilt] = useState<{
    revision: number;
    version: number;
    artifact: number;
  } | null>(null);
  const [running, setRunning] = useState(false);
  const [restart, setRestart] = useState(0);
  const [pending, setPending] = useState(false);
  const flight = useRef(false);
  const latestState = useRef(state);
  latestState.current = state;
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const saved = isStudioSaved(state);
  const currentBuild =
    saved &&
    built?.revision === state.acknowledged.revision &&
    built?.version === state.version;
  async function perform(action: "build" | "metadata" | "submit") {
    if (
      flight.current ||
      !isStudioSaved(latestState.current) ||
      (action === "submit" && !currentBuild)
    )
      return;
    flight.current = true;
    setPending(true);
    setError("");
    setMessage("");
    const revision = state.acknowledged.revision;
    const version = state.version;
    try {
      if (action === "build") {
        setRunning(false);
        setBuilt(null);
        const result = await api.post<GameSummary>(
          `/games/${encodeURIComponent(game.id)}/build`,
          {},
        );
        setGame(result);
        if (
          isStudioSaved(latestState.current) &&
          latestState.current.acknowledged.revision === revision &&
          latestState.current.version === version
        ) {
          setBuilt({ revision, version, artifact: result.artifactVersion });
          setRunning(true);
          setMessage(`Bản chơi thử từ phiên bản ${revision}.`);
        } else
          setMessage(
            "Dự án đã thay đổi trong khi tạo bản chơi thử. Chờ lưu rồi tạo lại.",
          );
      } else if (action === "metadata") {
        const data = UpdateGameInput.parse({ description, accessMode });
        setGame(
          await api.patch<GameSummary>(
            `/games/${encodeURIComponent(game.id)}`,
            data,
          ),
        );
        setMessage("Đã lưu thông tin công khai.");
      } else {
        setGame(
          await api.post<GameSummary>(
            `/games/${encodeURIComponent(game.id)}/submit`,
            {},
          ),
        );
        setMessage(
          "Đã gửi duyệt. Trò chơi sẽ xuất hiện công khai sau khi được chấp thuận.",
        );
      }
    } catch (failure) {
      setError(
        failure instanceof ApiError
          ? apiErrorMessage(failure, failure.message)
          : "Không thể hoàn tất. Kiểm tra thông tin và thử lại.",
      );
    } finally {
      flight.current = false;
      setPending(false);
    }
  }
  return (
    <section
      className="studio-task-panel studio-play"
      aria-label="Chơi thử và xuất bản"
    >
      <h2>Chơi thử & xuất bản</h2>
      <p>1. Chờ Đã lưu → 2. Tạo bản chơi thử → 3. Kiểm tra → 4. Gửi duyệt.</p>
      {!saved && (
        <p role="status">
          Đang có thay đổi chưa được xác nhận. Hoàn tất lưu hoặc xử lý lỗi đồng
          bộ trước khi tạo bản chơi thử.
        </p>
      )}
      {built && !currentBuild && (
        <p role="status">
          Bản chơi thử cũ không chứa thay đổi mới. Hãy tạo lại sau khi lưu.
        </p>
      )}
      <div className="studio-task-actions">
        <button
          disabled={!saved || pending}
          onClick={() => void perform("build")}
        >
          {pending ? "Đang xử lý…" : "Tạo bản chơi thử"}
        </button>
        <button
          disabled={!currentBuild || pending}
          onClick={() => {
            setRestart((value) => value + 1);
            setRunning(true);
          }}
        >
          Chơi lại
        </button>
        <button disabled={!running} onClick={() => setRunning(false)}>
          Dừng
        </button>
      </div>
      {currentBuild && running && (
        <iframe
          key={restart}
          title="Chơi thử trò chơi"
          src={`${resolvePublicApiBaseUrl()}/games/${encodeURIComponent(game.id)}/preview/?v=${built.artifact}&restart=${restart}`}
          sandbox="allow-scripts allow-pointer-lock"
        />
      )}
      <h3>Thông tin trước khi gửi duyệt</h3>
      <p>
        Đổi tên trò chơi ở thanh trên. Bản nháp vẫn riêng tư trong lúc chờ
        duyệt.
      </p>
      <label>
        Mô tả trò chơi
        <textarea
          rows={4}
          maxLength={2000}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>
      <label>
        Ai có thể chơi
        <select
          value={accessMode}
          onChange={(event) =>
            setAccessMode(event.target.value as GameSummary["accessMode"])
          }
        >
          <option value="GUEST_ALLOWED">Mọi người, gồm khách</option>
          <option value="AUTH_REQUIRED">Người đã đăng nhập</option>
        </select>
      </label>
      <div className="studio-task-actions">
        <button
          disabled={!saved || pending}
          onClick={() => void perform("metadata")}
        >
          Lưu thông tin công khai
        </button>
        <button
          disabled={
            !currentBuild ||
            pending ||
            game.reviewState === "PENDING" ||
            description !== game.description ||
            accessMode !== game.accessMode
          }
          onClick={() => void perform("submit")}
        >
          Gửi duyệt
        </button>
      </div>
      {game.reviewState === "PENDING" && <p>Đang chờ duyệt.</p>}
      {game.reviewNote && <p>Ghi chú kiểm duyệt: {game.reviewNote}</p>}
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
    </section>
  );
}

export function StudioAudioAssets({ assets }: { assets: GameAssetSummary[] }) {
  const { state, editable, commit, error } = useCanonicalCommit();
  const audio = assets.filter(
    (asset) => asset.kind === "AUDIO" && asset.state === "READY",
  );
  if (!audio.length) return null;
  return (
    <section aria-label="Dùng âm thanh trong code">
      <h3>Âm thanh cho code</h3>
      <p>
        Khai báo WAV để đưa tệp vào bản chơi thử. Sau đó dùng đoạn code dưới đây
        với quyền Phát âm thanh.
      </p>
      {audio.map((asset) => (
        <div key={asset.id}>
          <strong>{asset.displayName}</strong>
          <button
            disabled={!editable || state.document.assetIds.includes(asset.id)}
            onClick={() =>
              commit([{ type: "asset.declare", assetId: asset.id }])
            }
          >
            {state.document.assetIds.includes(asset.id)
              ? "Đã khai báo"
              : "Dùng trong dự án"}
          </button>
          <pre>{`api.playAudio("${asset.id}");`}</pre>
        </div>
      ))}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
