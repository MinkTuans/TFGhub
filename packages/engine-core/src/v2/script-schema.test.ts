import { describe, expect, it } from "vitest";
import {
  ScriptResourceV2,
  V2_SCRIPT_CAPABILITIES,
  V2_SCRIPT_LIMITS,
  validateScriptResourceV2,
} from "./script-schema.js";

const id = (suffix: string) => `550e8400-e29b-41d4-a716-44665544${suffix}`;
const ids = {
  script: id("0001"),
  attachment: id("0002"),
  scene: id("0003"),
  object: id("0004"),
  event: id("0005"),
};

const script = (overrides: Record<string, unknown> = {}) => ({
  id: ids.script,
  version: 1,
  name: "Open gate",
  language: "JAVASCRIPT",
  source: "game.changeScene(sceneId);",
  capabilities: ["CHANGE_SCENE"],
  attachments: [
    { id: ids.attachment, type: "SCENE", sceneId: ids.scene },
    { id: id("0006"), type: "OBJECT", objectId: ids.object },
    { id: id("0007"), type: "EVENT", eventId: ids.event },
  ],
  ...overrides,
});

describe("V2 script resource schema", () => {
  it("accepts JavaScript source, declared bridge capabilities, and typed attachments", () => {
    expect(V2_SCRIPT_CAPABILITIES).toEqual([
      "GET_VARIABLE",
      "SET_VARIABLE",
      "CHANGE_SCENE",
      "SPAWN_OBJECT",
      "PLAY_AUDIO",
      "SHOW_DIALOGUE",
    ]);
    expect(ScriptResourceV2.safeParse(script()).success).toBe(true);
  });

  it("rejects unsupported languages, unknown capabilities, and duplicate capabilities", () => {
    expect(
      ScriptResourceV2.safeParse(script({ language: "TYPESCRIPT" })).success,
    ).toBe(false);
    expect(
      ScriptResourceV2.safeParse(script({ capabilities: ["FETCH"] })).success,
    ).toBe(false);
    expect(
      ScriptResourceV2.safeParse(
        script({ capabilities: ["CHANGE_SCENE", "CHANGE_SCENE"] }),
      ).success,
    ).toBe(false);
  });

  it("enforces source and attachment limits", () => {
    expect(
      ScriptResourceV2.safeParse(
        script({ source: "x".repeat(V2_SCRIPT_LIMITS.sourceBytes + 1) }),
      ).success,
    ).toBe(false);
    expect(
      ScriptResourceV2.safeParse(
        script({
          attachments: Array.from(
            { length: V2_SCRIPT_LIMITS.attachments + 1 },
            (_, index) => ({
              id: id((0x1000 + index).toString(16).padStart(4, "0")),
              type: "SCENE",
              sceneId: ids.scene,
            }),
          ),
        }),
      ).success,
    ).toBe(false);
  });

  it("measures the source limit in UTF-8 bytes rather than code units", () => {
    const multibyteSource = "é".repeat(V2_SCRIPT_LIMITS.sourceBytes / 2 + 1);
    expect(multibyteSource.length).toBeLessThan(V2_SCRIPT_LIMITS.sourceBytes);
    expect(
      ScriptResourceV2.safeParse(script({ source: multibyteSource })).success,
    ).toBe(false);
  });

  it("requires stable unique IDs and normalizes them", () => {
    const parsed = ScriptResourceV2.parse(
      script({ id: ids.script.toUpperCase() }),
    );
    expect(parsed.id).toBe(ids.script);
    expect(
      ScriptResourceV2.safeParse(
        script({
          attachments: [
            { id: ids.attachment, type: "SCENE", sceneId: ids.scene },
            { id: ids.attachment, type: "EVENT", eventId: ids.event },
          ],
        }),
      ).success,
    ).toBe(false);
    expect(
      ScriptResourceV2.safeParse(
        script({
          attachments: [{ id: ids.script, type: "SCENE", sceneId: ids.scene }],
        }),
      ).success,
    ).toBe(false);
  });

  it("rejects arbitrary executable values and editor/vendor state", () => {
    expect(
      ScriptResourceV2.safeParse({ ...script(), execute: () => undefined })
        .success,
    ).toBe(false);
    expect(
      ScriptResourceV2.safeParse({ ...script(), monaco: { cursor: 10 } })
        .success,
    ).toBe(false);
  });

  it("validates every attachment reference without executing source", () => {
    const parsed = ScriptResourceV2.parse(script());
    expect(
      validateScriptResourceV2(parsed, {
        sceneIds: new Set([ids.scene]),
        objectIds: new Set(),
        eventIds: new Set([ids.event]),
      }),
    ).toEqual(["Script references an object that does not exist"]);
  });
});
