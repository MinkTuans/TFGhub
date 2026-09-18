import { expect, it } from "vitest";
import { compileEngineHtml, createScriptWorkerSource } from "./engine-html.js";
import { createPixelAdventure } from "../templates/pixel-adventure.js";
import { randomUUID } from "node:crypto";
import vm from "node:vm";
it("embeds validated canonical data without executable HTML injection", () => {
  const project = createPixelAdventure(randomUUID(), randomUUID);
  project.scenes[0].name = "</script><script>alert(1)</script>";
  const html = compileEngineHtml(project, {});
  expect(html).not.toContain(project.scenes[0].name);
  expect(html).toContain("\\u003c/script>");
  expect(html).toContain("new Worker(");
  expect(html).toContain("pointerdown");
  expect(html).toContain('c.type === "Tilemap"');
  expect(html).toContain("tileset.width / p.tileWidth");
  expect(() =>
    compileEngineHtml({ ...project, entrySceneId: "invalid" }, {}),
  ).toThrow();
});
it("worker supports capability-scoped commands and reports thrown errors", async () => {
  const messages: any[] = [];
  const sandbox: any = { postMessage: (m: any) => messages.push(m) };
  vm.createContext(sandbox);
  vm.runInContext(
    createScriptWorkerSource(
      'api.showDialogue("Hello"); api.setVariable("v", 9);',
    ),
    sandbox,
  );
  await sandbox.onmessage({
    data: { capabilities: ["SHOW_DIALOGUE"], variables: {} },
  });
  expect(messages).toContainEqual({
    type: "COMMAND",
    command: { type: "SHOW_DIALOGUE", text: "Hello" },
  });
  expect(messages.find((m) => m.type === "ERROR")?.message).toContain(
    "SET_VARIABLE",
  );
});
it("worker reads only granted variable snapshots and bounds outgoing commands", async () => {
  const messages: any[] = [];
  const sandbox: any = { postMessage: (m: any) => messages.push(m) };
  vm.createContext(sandbox);
  vm.runInContext(
    createScriptWorkerSource(
      'for(let i=0;i<110;i++) api.showDialogue(String(api.getVariable("v")));',
    ),
    sandbox,
  );
  await sandbox.onmessage({
    data: {
      capabilities: ["GET_VARIABLE", "SHOW_DIALOGUE"],
      variables: { v: 12 },
    },
  });
  expect(messages.filter((m) => m.type === "COMMAND")).toHaveLength(100);
  expect(messages.some((m) => m.type === "ERROR")).toBe(true);
});
