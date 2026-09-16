import { EngineProjectV2 } from "../v2/project-schema.js";
import { BUILTIN_PIXEL_SPRITES } from "../templates/pixel-art.js";
import { createGameRuntime } from "./game-runtime.js";

/** Source is compiled only inside a disposable worker, never the host page/server. */
export function createScriptWorkerSource(source: string): string {
  return `"use strict";onmessage=async function(event){const send=postMessage.bind(globalThis), data=event.data;let count=0;const capabilities=new Set(data.capabilities);function requireCapability(type){if(!capabilities.has(type))throw Error('Capability denied: '+type);}function command(type,args){requireCapability(type);if(++count>100)throw Error('Script command limit exceeded');send({type:'COMMAND',command:{type,...args}});}const variables=Object.assign(Object.create(null),data.variables);const api=Object.freeze({getVariable(id){requireCapability('GET_VARIABLE');return variables[id];},setVariable(variableId,value){command('SET_VARIABLE',{variableId,value});variables[variableId]=value;},changeScene(sceneId){command('CHANGE_SCENE',{sceneId});},spawnObject(prefabId,x,y){command('SPAWN_OBJECT',{prefabId,x,y});},playAudio(assetId){command('PLAY_AUDIO',{assetId});},showDialogue(text){command('SHOW_DIALOGUE',{text});}});try{await (async function(api){\n${source}\n})(api);send({type:'DONE'});}catch(error){send({type:'ERROR',message:String(error&&error.message||error).slice(0,500)});}};postMessage({type:'READY'});`;
}

/** All dependencies are passed explicitly because this function is serialized. */
function browserPlayer(
  project: EngineProjectV2,
  assets: Record<string, string>,
  sprites: typeof BUILTIN_PIXEL_SPRITES,
  runtimeFactory: typeof createGameRuntime,
  workerSource: typeof createScriptWorkerSource,
) {
  const canvas = document.getElementById("game") as HTMLCanvasElement,
    ctx = canvas.getContext("2d")!;
  const hud = document.getElementById("hud")!,
    dialogue = document.getElementById("dialogue")!,
    diagnostics = document.getElementById("diagnostics")!,
    outcome = document.getElementById("outcome")!;
  const runtime = runtimeFactory(project),
    keys = new Set<string>(),
    touch = new Set<string>(),
    workers = new Map<Worker, () => void>(),
    images = new Map<string, HTMLImageElement>(),
    audio = new Map<string, HTMLAudioElement>();
  let paused = false,
    last = 0,
    accumulator = 0,
    sceneId = runtime.state.sceneId,
    workerRuns = 0,
    runWindow = 0,
    cameraX = 0,
    cameraY = 0;
  canvas.width = project.settings.viewport.width;
  canvas.height = project.settings.viewport.height;
  for (const [id, url] of Object.entries(assets)) {
    const img = new Image();
    img.onload = () => images.set(id, img);
    img.onerror = () => runtime.diagnostic(`Cannot load image asset: ${id}`);
    if (!/\.(wav|mp3|ogg)(?:$|\?)/i.test(url)) img.src = url;
  }
  const stopWorkers = () => {
    for (const finish of workers.values()) finish();
    workers.clear();
  };
  const stopAudio = () => {
    for (const a of audio.values()) a.pause();
    audio.clear();
  };
  function runScript(id: string) {
    const script = project.scripts.find((s) => s.id === id);
    if (!script) return;
    const now = performance.now();
    if (now - runWindow > 1000) {
      runWindow = now;
      workerRuns = 0;
    }
    if (workers.size >= 8 || ++workerRuns > 30) {
      runtime.diagnostic("Script invocation budget exceeded");
      return;
    }
    let worker: Worker,
      url = "";
    try {
      url = URL.createObjectURL(
        new Blob([workerSource(script.source)], { type: "text/javascript" }),
      );
      worker = new Worker(url);
    } catch (e) {
      runtime.diagnostic(`Cannot start isolated script: ${String(e)}`);
      if (url) URL.revokeObjectURL(url);
      return;
    }
    URL.revokeObjectURL(url);
    let commands = 0,
      started = false;
    const finish = () => {
      clearTimeout(timeout);
      worker.terminate();
      workers.delete(worker);
    };
    let timeout = setTimeout(() => {
      runtime.diagnostic(`${script.name}: worker failed to initialize`);
      finish();
    }, 5000);
    workers.set(worker, finish);
    worker.onerror = (e) => {
      e.preventDefault();
      runtime.diagnostic(`${script.name}: ${e.message}`);
      finish();
    };
    worker.onmessage = (e) => {
      const message = e.data;
      if (!message || typeof message !== "object") return;
      if (message.type === "READY" && !started) {
        started = true;
        clearTimeout(timeout);
        timeout = setTimeout(() => {
          runtime.diagnostic(`${script.name}: stopped after 500ms`);
          finish();
        }, 500);
        worker.postMessage({
          capabilities: script.capabilities,
          variables: script.capabilities.includes("GET_VARIABLE")
            ? runtime.state.variables
            : {},
        });
      } else if (message.type === "COMMAND") {
        if (++commands > 100) {
          runtime.diagnostic(`${script.name}: command limit exceeded`);
          finish();
          return;
        }
        runtime.command(id, message.command);
      } else if (message.type === "ERROR") {
        runtime.diagnostic(
          `${script.name}: ${String(message.message).slice(0, 500)}`,
        );
        finish();
      } else if (message.type === "DONE") finish();
    };
  }
  function effects() {
    const batch = runtime.state.effects.splice(0);
    for (const e of batch) {
      if (e.type === "RUN_SCRIPT") runScript(String(e.scriptId));
      else if (e.type === "SHOW_DIALOGUE") {
        dialogue.textContent = String(e.text);
        dialogue.hidden = false;
      } else if (e.type === "PLAY_AUDIO") {
        const id = String(e.assetId),
          url = assets[id];
        if (url) {
          const a = new Audio(url);
          audio.get(id)?.pause();
          audio.set(id, a);
          void a
            .play()
            .catch(() =>
              runtime.diagnostic("Tap the game to enable audio playback"),
            );
        }
      } else if (e.type === "STOP_AUDIO") audio.get(String(e.assetId))?.pause();
    }
  }
  function reset() {
    stopWorkers();
    stopAudio();
    runtime.restart();
    sceneId = runtime.state.sceneId;
    keys.clear();
    touch.clear();
    paused = false;
    accumulator = 0;
    dialogue.hidden = true;
    workerRuns = 0;
    effects();
  }
  document.getElementById("restart")!.addEventListener("click", reset);
  document.getElementById("pause")!.addEventListener("click", () => {
    paused = !paused;
    keys.clear();
    touch.clear();
    document.getElementById("pause")!.textContent = paused
      ? "Tiếp tục"
      : "Tạm dừng";
  });
  dialogue.addEventListener("click", () => {
    dialogue.hidden = true;
  });
  function interact() {
    const actors = runtime
      .scene()
      .objects.filter((o) => o.enabled && o.objectType === "PLAYER");
    for (const o of runtime.scene().objects) {
      const p = runtime.properties(o, "Interactable"),
        t = runtime.properties(o, "Transform")!;
      if (
        o.enabled &&
        p?.enabled &&
        actors.some((a) => {
          const aT = runtime.properties(a, "Transform")!;
          return Math.hypot(aT.x - t.x, aT.y - t.y) <= p.range;
        })
      )
        runtime.emit("ON_INTERACT", { objectId: o.id });
    }
  }
  addEventListener("keydown", (e) => {
    const key = e.key.toLowerCase();
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key))
      e.preventDefault();
    keys.add(key);
    runtime.emit("ON_KEY_PRESS", { key: e.key, repeat: e.repeat });
    if (key === "e" || key === " ") interact();
    if (key === "r" && !e.repeat) reset();
  });
  addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
  addEventListener("blur", () => {
    keys.clear();
    touch.clear();
  });
  for (const button of Array.from(
    document.querySelectorAll<HTMLButtonElement>("[data-direction]"),
  )) {
    const direction = button.dataset.direction!;
    button.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      button.setPointerCapture(e.pointerId);
      touch.add(direction);
    });
    for (const name of ["pointerup", "pointercancel", "lostpointercapture"])
      button.addEventListener(name, () => touch.delete(direction));
  }
  document.getElementById("interact")!.addEventListener("click", interact);
  canvas.addEventListener("pointerdown", (e) => {
    const rect = canvas.getBoundingClientRect(),
      x = ((e.clientX - rect.left) * canvas.width) / rect.width + cameraX,
      y = ((e.clientY - rect.top) * canvas.height) / rect.height + cameraY;
    for (const o of [...runtime.scene().objects].reverse()) {
      const t = runtime.properties(o, "Transform")!;
      if (
        o.enabled &&
        o.visible &&
        x >= t.x &&
        y >= t.y &&
        x < t.x + t.width &&
        y < t.y + t.height
      ) {
        runtime.emit("ON_CLICK", { objectId: o.id });
        break;
      }
    }
  });
  function draw() {
    const scene = runtime.scene();
    ctx.imageSmoothingEnabled = !project.settings.pixelArt;
    ctx.fillStyle = scene.background.color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const camera = scene.objects.find(
        (o) => o.enabled && runtime.properties(o, "Camera"),
      ),
      cameraProperties = runtime.properties(camera, "Camera");
    const focus =
        scene.objects.find((o) => o.id === cameraProperties?.followObjectId) ??
        scene.objects.find((o) => o.enabled && o.objectType === "PLAYER"),
      f = runtime.properties(focus, "Transform");
    cameraX = f
      ? Math.max(
          0,
          Math.min(
            scene.width - canvas.width,
            f.x + f.width / 2 - canvas.width / 2,
          ),
        )
      : 0;
    cameraY = f
      ? Math.max(
          0,
          Math.min(
            scene.height - canvas.height,
            f.y + f.height / 2 - canvas.height / 2,
          ),
        )
      : 0;
    const bg = scene.background.assetId && images.get(scene.background.assetId);
    if (bg) ctx.drawImage(bg, -cameraX, -cameraY, scene.width, scene.height);
    const layers = new Map(scene.layers.map((l) => [l.id, l]));
    const objects = [...scene.objects].sort(
      (a, b) =>
        layers.get(a.layerId)!.order - layers.get(b.layerId)!.order ||
        a.renderOrder - b.renderOrder ||
        a.order - b.order,
    );
    for (const o of objects) {
      if (!o.enabled || !o.visible || !layers.get(o.layerId)?.visible) continue;
      const chain = [o];
      let parent = o.parentId
        ? scene.objects.find((p) => p.id === o.parentId)
        : undefined;
      while (parent && chain.length < 1000) {
        chain.unshift(parent);
        parent = parent.parentId
          ? scene.objects.find((p) => p.id === parent!.parentId)
          : undefined;
      }
      if (
        chain.some(
          (p) => !p.enabled || !p.visible || !layers.get(p.layerId)?.visible,
        )
      )
        continue;
      ctx.save();
      if (layers.get(o.layerId)?.type !== "UI")
        ctx.translate(-cameraX, -cameraY);
      for (const obj of chain) {
        const t = runtime.properties(obj, "Transform")!,
          px = t.width * (t.pivot?.x ?? 0.5),
          py = t.height * (t.pivot?.y ?? 0.5);
        ctx.translate(t.x + px, t.y + py);
        ctx.rotate((t.rotation * Math.PI) / 180);
        ctx.scale(t.scaleX, t.scaleY);
        ctx.translate(-px, -py);
      }
      const t = runtime.properties(o, "Transform")!;
      for (const c of o.components) {
        const p = c.properties as any;
        if (p.visible === false) continue;
        if (c.type === "SpriteRenderer" || c.type === "UIImage") {
          ctx.save();
          ctx.globalAlpha = p.opacity ?? 1;
          if (p.flipX) {
            ctx.translate(t.width, 0);
            ctx.scale(-1, 1);
          }
          if (p.flipY) {
            ctx.translate(0, t.height);
            ctx.scale(1, -1);
          }
          const img = p.assetId && images.get(p.assetId),
            sprite = !p.assetId && (sprites as Record<string, any>)[p.frame];
          if (img) ctx.drawImage(img, 0, 0, t.width, t.height);
          else if (sprite) {
            for (let y = 0; y < sprite.height; y++)
              for (let x = 0; x < sprite.width; x++) {
                const color = sprite.palette[sprite.pixels[y][x]];
                if (color && color !== "transparent") {
                  ctx.fillStyle = color;
                  ctx.fillRect(
                    (x * t.width) / sprite.width,
                    (y * t.height) / sprite.height,
                    t.width / sprite.width + 0.05,
                    t.height / sprite.height + 0.05,
                  );
                }
              }
          } else if (!p.assetId) {
            ctx.fillStyle = "#7b91c9";
            ctx.fillRect(0, 0, t.width, t.height);
          }
          ctx.restore();
        } else if (c.type === "Text") {
          ctx.fillStyle = p.color;
          ctx.font = `${p.fontSize}px monospace`;
          ctx.textBaseline = "top";
          ctx.textAlign = p.align.toLowerCase();
          String(p.text)
            .split("\n")
            .forEach((line: string, i: number) =>
              ctx.fillText(
                line,
                p.align === "CENTER"
                  ? t.width / 2
                  : p.align === "RIGHT"
                    ? t.width
                    : 0,
                i * p.fontSize * 1.25,
              ),
            );
        } else if (c.type === "UIPanel") {
          ctx.globalAlpha = p.opacity;
          ctx.fillStyle = p.backgroundColor;
          ctx.fillRect(0, 0, t.width, t.height);
          ctx.globalAlpha = 1;
        } else if (c.type === "UIButton") {
          ctx.fillStyle = p.enabled ? "#285c85" : "#414858";
          ctx.fillRect(0, 0, t.width, t.height);
          ctx.fillStyle = "#fff";
          ctx.font = "16px sans-serif";
          ctx.fillText(p.label, 8, 22);
        }
      }
      ctx.restore();
    }
    const player = scene.objects.find(
        (o) => o.enabled && o.objectType === "PLAYER",
      ),
      health = runtime.properties(player, "Health");
    hud.textContent = `${scene.name} · Điểm ${runtime.state.score}${health ? " · ♥ " + health.current + "/" + health.maximum : ""}${paused ? " · Tạm dừng" : ""}`;
    outcome.hidden = runtime.state.status === "playing";
    outcome.textContent =
      runtime.state.status === "won"
        ? "Hoàn thành! Chọn Chơi lại để bắt đầu."
        : "Hết sức! Chọn Chơi lại để thử tiếp.";
    diagnostics.textContent = runtime.state.diagnostics.join("\n");
    diagnostics.parentElement!.hidden = !runtime.state.diagnostics.length;
  }
  function frame(now: number) {
    const elapsed = last ? Math.min((now - last) / 1000, 0.1) : 0;
    last = now;
    if (!paused) {
      accumulator += elapsed;
      while (accumulator >= 1 / 60) {
        runtime.tick(1 / 60, {
          left: keys.has("arrowleft") || keys.has("a") || touch.has("left"),
          right: keys.has("arrowright") || keys.has("d") || touch.has("right"),
          up: keys.has("arrowup") || keys.has("w") || touch.has("up"),
          down: keys.has("arrowdown") || keys.has("s") || touch.has("down"),
        });
        accumulator -= 1 / 60;
      }
      if (sceneId !== runtime.state.sceneId) {
        stopWorkers();
        stopAudio();
        sceneId = runtime.state.sceneId;
      }
      effects();
    }
    draw();
    requestAnimationFrame(frame);
  }
  addEventListener("pagehide", () => {
    stopWorkers();
    stopAudio();
  });
  effects();
  requestAnimationFrame(frame);
}

export function compileEngineHtml(
  project: EngineProjectV2,
  assets: Record<string, string>,
): string {
  const parsed = EngineProjectV2.parse(project);
  // Reject executable/remote manifests. Artifacts are immutable relative paths; data is allowed for local previews.
  const safeAssets = Object.fromEntries(
    Object.entries(assets).filter(
      ([id, url]) =>
        parsed.assetIds.includes(id) &&
        typeof url === "string" &&
        (/^(?:\.\/)?assets\/[a-zA-Z0-9._/-]+$/.test(url) ||
          /^data:(image\/(png|jpeg|webp)|audio\/wav);base64,[a-zA-Z0-9+/=]+$/.test(
            url,
          )),
    ),
  );
  const serialize = (value: unknown) =>
    JSON.stringify(value)
      .replace(/</g, "\\u003c")
      .replace(/\u2028/g, "\\u2028")
      .replace(/\u2029/g, "\\u2029");
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TFG Pixel Player</title><style>*{box-sizing:border-box}body{margin:0;background:#101b28;color:#eef5ff;font:14px system-ui;display:flex;min-height:100dvh;align-items:center;justify-content:center}main{width:min(100%,960px);padding:12px}header,nav{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin:8px 0}canvas{display:block;width:100%;max-height:72dvh;object-fit:contain;background:#16283c;image-rendering:pixelated;border-radius:8px;touch-action:none}button{font:inherit;color:inherit;background:#294158;border:1px solid #54738c;border-radius:8px;min-height:44px;padding:8px 14px;cursor:pointer;touch-action:none}#dialogue,#outcome{padding:14px;background:#294158;border-radius:8px;white-space:pre-wrap}#touch{display:flex;gap:5px}pre{white-space:pre-wrap;max-height:160px;overflow:auto;color:#ffd28a}.hint{color:#b7c8d7;font-size:12px}[hidden]{display:none!important}</style></head><body><main><header><strong id="hud">Đang tải…</strong><span><button id="pause">Tạm dừng</button> <button id="restart">Chơi lại</button></span></header><canvas id="game" tabindex="0" aria-label="Màn hình trò chơi"></canvas><p id="outcome" role="status" hidden></p><button id="dialogue" hidden aria-label="Đóng hội thoại"></button><nav><span class="hint">WASD / phím mũi tên · E tương tác · R chơi lại</span><span id="touch"><button data-direction="left" aria-label="Trái">←</button><button data-direction="up" aria-label="Lên">↑</button><button data-direction="down" aria-label="Xuống">↓</button><button data-direction="right" aria-label="Phải">→</button><button id="interact">E</button></span></nav><details hidden><summary>Chẩn đoán runtime</summary><pre id="diagnostics"></pre></details></main><script>(${browserPlayer.toString()})(${serialize(parsed)},${serialize(safeAssets)},${serialize(BUILTIN_PIXEL_SPRITES)},${createGameRuntime.toString()},${createScriptWorkerSource.toString()});</script></body></html>`;
}
