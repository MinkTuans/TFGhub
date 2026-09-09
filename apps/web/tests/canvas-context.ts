/** Canvas2D boundary recorder for jsdom, which has no raster backend installed.
 * Pixel/transform/clipping behavior is independently exercised in Chrome e2e.
 */
export function recordingContext(width = 640, height = 480) {
  const calls: { name: string; args: unknown[] }[] = [];
  const state: Record<string, unknown> = {
    fillStyle: "#000000",
    strokeStyle: "#000000",
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    lineWidth: 1,
    font: "10px sans-serif",
    textAlign: "start",
    textBaseline: "alphabetic",
    imageSmoothingEnabled: true,
  };
  const stack: Record<string, unknown>[] = [];
  const target: Record<string, unknown> = { canvas: { width, height } };
  for (const method of [
    "setTransform",
    "clearRect",
    "beginPath",
    "rect",
    "clip",
    "fillRect",
    "strokeRect",
    "fillText",
    "moveTo",
    "lineTo",
    "stroke",
    "drawImage",
    "translate",
    "scale",
    "transform",
    "ellipse",
    "fill",
    "setLineDash",
  ]) {
    target[method] = (...args: unknown[]) => calls.push({ name: method, args });
  }
  target.save = () => {
    calls.push({ name: "save", args: [] });
    stack.push({ ...state });
  };
  target.restore = () => {
    calls.push({ name: "restore", args: [] });
    Object.assign(state, stack.pop());
  };
  const context = new Proxy(target, {
    get: (object, key: string) => (key in state ? state[key] : object[key]),
    set: (_object, key: string, value) => {
      state[key] = value;
      calls.push({ name: key, args: [value] });
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { context, calls, state, stack };
}
