import { describe, expect, it } from "vitest";
import {
  MiniGameDefinitionV2,
  MiniGameResultV2,
  V2_MINI_GAME_LIMITS,
  V2_MINI_GAME_TYPES,
  v2MiniGameRegistry,
  validateMiniGameDefinitionV2,
  validateMiniGameResultV2,
} from "./module-schema.js";

const id = (suffix: string) => `550e8400-e29b-41d4-a716-44665544${suffix}`;
const ids = {
  module: id("0001"),
  question: id("0002"),
  choice: id("0003"),
  otherChoice: id("0004"),
  asset: id("0005"),
  piece: id("0006"),
  target: id("0007"),
  item: id("0008"),
  variable: id("0009"),
};

const base = (type: string, config: unknown) => ({
  id: ids.module,
  version: 1,
  name: "Challenge",
  type,
  config,
});

describe("V2 mini-game module schema", () => {
  it("registers exactly the five approved module types using metadata-only keys", () => {
    expect(V2_MINI_GAME_TYPES).toEqual([
      "QUIZ",
      "PUZZLE",
      "MEMORY",
      "DRAG_DROP",
      "REACTION",
    ]);
    expect(Object.keys(v2MiniGameRegistry)).toEqual(V2_MINI_GAME_TYPES);
    expect(
      Object.fromEntries(
        V2_MINI_GAME_TYPES.map((type) => [
          type,
          v2MiniGameRegistry[type].runtimeHandlerKey,
        ]),
      ),
    ).toEqual({
      QUIZ: "tfg.mini-game.quiz.v1",
      PUZZLE: "tfg.mini-game.puzzle.v1",
      MEMORY: "tfg.mini-game.memory.v1",
      DRAG_DROP: "tfg.mini-game.drag-drop.v1",
      REACTION: "tfg.mini-game.reaction.v1",
    });
  });

  it("accepts bounded Quiz input", () => {
    expect(
      MiniGameDefinitionV2.safeParse(
        base("QUIZ", {
          questions: [
            {
              id: ids.question,
              prompt: "2 + 2?",
              choices: [
                { id: ids.choice, text: "4" },
                { id: ids.otherChoice, text: "5" },
              ],
              correctChoiceId: ids.choice,
              points: 10,
            },
          ],
          passScore: 10,
          shuffleQuestions: false,
          timeLimitMs: null,
        }),
      ).success,
    ).toBe(true);
  });

  it("accepts bounded Puzzle input with asset references", () => {
    expect(
      MiniGameDefinitionV2.safeParse(
        base("PUZZLE", {
          board: { width: 640, height: 480 },
          pieces: [
            {
              id: ids.piece,
              assetId: ids.asset,
              startX: 0,
              startY: 0,
              targetX: 10,
              targetY: 20,
            },
          ],
          tolerance: 8,
          timeLimitMs: null,
        }),
      ).success,
    ).toBe(true);
  });

  it("constrains Puzzle coordinates and tolerance to its board", () => {
    const config = {
      board: { width: 100, height: 80 },
      pieces: [
        {
          id: ids.piece,
          assetId: ids.asset,
          startX: 0,
          startY: 0,
          targetX: 100,
          targetY: 80,
        },
      ],
      tolerance: 80,
      timeLimitMs: null,
    };
    expect(MiniGameDefinitionV2.safeParse(base("PUZZLE", config)).success).toBe(
      true,
    );
    expect(
      MiniGameDefinitionV2.safeParse(
        base("PUZZLE", {
          ...config,
          pieces: [{ ...config.pieces[0], targetX: 101 }],
        }),
      ).success,
    ).toBe(false);
    expect(
      MiniGameDefinitionV2.safeParse(
        base("PUZZLE", {
          ...config,
          tolerance: 81,
        }),
      ).success,
    ).toBe(false);
  });

  it("accepts bounded Memory input with exactly paired keys", () => {
    expect(
      MiniGameDefinitionV2.safeParse(
        base("MEMORY", {
          cards: [
            { id: ids.piece, pairKey: "apple", assetId: ids.asset },
            { id: ids.target, pairKey: "apple", assetId: ids.asset },
          ],
          columns: 2,
          previewMs: 500,
        }),
      ).success,
    ).toBe(true);
  });

  it("accepts bounded Drag Drop input with typed targets", () => {
    expect(
      MiniGameDefinitionV2.safeParse(
        base("DRAG_DROP", {
          items: [{ id: ids.piece, assetId: ids.asset, targetId: ids.target }],
          targets: [{ id: ids.target, assetId: ids.asset, label: "Basket" }],
          timeLimitMs: 10_000,
        }),
      ).success,
    ).toBe(true);
  });

  it("accepts bounded Reaction input", () => {
    expect(
      MiniGameDefinitionV2.safeParse(
        base("REACTION", {
          rounds: 5,
          minimumDelayMs: 250,
          maximumDelayMs: 1_000,
          responseTimeoutMs: 2_000,
        }),
      ).success,
    ).toBe(true);
  });

  it("rejects unknown modules and invalid type-specific invariants", () => {
    expect(MiniGameDefinitionV2.safeParse(base("PLATFORM", {})).success).toBe(
      false,
    );
    expect(
      MiniGameDefinitionV2.safeParse(
        base("QUIZ", {
          questions: [
            {
              id: ids.question,
              prompt: "?",
              choices: [{ id: ids.choice, text: "A" }],
              correctChoiceId: ids.otherChoice,
              points: 1,
            },
          ],
          passScore: 1,
          shuffleQuestions: false,
          timeLimitMs: null,
        }),
      ).success,
    ).toBe(false);
    expect(
      MiniGameDefinitionV2.safeParse(
        base("REACTION", {
          rounds: 1,
          minimumDelayMs: 2_000,
          maximumDelayMs: 1_000,
          responseTimeoutMs: 1_000,
        }),
      ).success,
    ).toBe(false);
  });

  it("enforces collection, text, time, and stable-ID bounds", () => {
    const questions = Array.from(
      { length: V2_MINI_GAME_LIMITS.questions + 1 },
      (_, index) => ({
        id: id((0x1000 + index).toString(16).padStart(4, "0")),
        prompt: "?",
        choices: [
          { id: id((0x2000 + index).toString(16).padStart(4, "0")), text: "A" },
        ],
        correctChoiceId: id((0x2000 + index).toString(16).padStart(4, "0")),
        points: 1,
      }),
    );
    expect(
      MiniGameDefinitionV2.safeParse(
        base("QUIZ", {
          questions,
          passScore: 1,
          shuffleQuestions: false,
          timeLimitMs: null,
        }),
      ).success,
    ).toBe(false);
    expect(
      MiniGameDefinitionV2.safeParse({
        ...base("REACTION", {
          rounds: 1,
          minimumDelayMs: 0,
          maximumDelayMs: 0,
          responseTimeoutMs: 1,
        }),
        id: "not-a-uuid",
      }).success,
    ).toBe(false);
  });

  it("normalizes nested IDs and rejects duplicate IDs", () => {
    const candidate = base("DRAG_DROP", {
      items: [
        {
          id: ids.piece.toUpperCase(),
          assetId: ids.asset.toUpperCase(),
          targetId: ids.target.toUpperCase(),
        },
      ],
      targets: [
        {
          id: ids.target.toUpperCase(),
          assetId: ids.asset.toUpperCase(),
          label: "Target",
        },
      ],
      timeLimitMs: null,
    });
    const parsed = MiniGameDefinitionV2.parse(candidate);
    expect(parsed.id).toBe(ids.module);
    expect(parsed.config.items[0].id).toBe(ids.piece);
    expect(
      MiniGameDefinitionV2.safeParse(
        base("MEMORY", {
          cards: [
            { id: ids.piece, pairKey: "a", assetId: ids.asset },
            { id: ids.piece, pairKey: "a", assetId: ids.asset },
          ],
          columns: 2,
          previewMs: 0,
        }),
      ).success,
    ).toBe(false);
  });

  it("rejects stable ID collisions across nested module entity categories", () => {
    expect(
      MiniGameDefinitionV2.safeParse(
        base("DRAG_DROP", {
          items: [{ id: ids.piece, assetId: ids.asset, targetId: ids.piece }],
          targets: [{ id: ids.piece, assetId: ids.asset, label: "Target" }],
          timeLimitMs: null,
        }),
      ).success,
    ).toBe(false);
  });

  it("rejects an unreachable Quiz pass score", () => {
    expect(
      MiniGameDefinitionV2.safeParse(
        base("QUIZ", {
          questions: [
            {
              id: ids.question,
              prompt: "?",
              choices: [{ id: ids.choice, text: "A" }],
              correctChoiceId: ids.choice,
              points: 5,
            },
          ],
          passScore: 6,
          shuffleQuestions: false,
          timeLimitMs: null,
        }),
      ).success,
    ).toBe(false);
  });

  it("validates asset, target, item, and variable references semantically", () => {
    const candidate = MiniGameDefinitionV2.parse(
      base("DRAG_DROP", {
        items: [{ id: ids.piece, assetId: ids.asset, targetId: ids.target }],
        targets: [{ id: ids.target, assetId: ids.asset, label: "Target" }],
        timeLimitMs: null,
      }),
    );
    expect(
      validateMiniGameDefinitionV2(candidate, {
        assetIds: new Set(),
        itemObjectIds: new Set(),
        globalVariables: new Map(),
        playerVariables: new Map(),
        sceneVariables: new Map(),
      }),
    ).toEqual(["Mini-game references an asset that does not exist"]);
  });

  it("uses one typed result envelope for outcomes, scores, and rewards", () => {
    const result = MiniGameResultV2.parse({
      outcome: "SUCCESS",
      score: 90,
      rewards: [
        { type: "ITEM", itemId: ids.item, quantity: 1 },
        {
          type: "VARIABLE",
          variable: { scope: "GLOBAL", variableId: ids.variable },
          value: true,
        },
        { type: "SCORE", amount: 10 },
      ],
    });
    expect(
      validateMiniGameResultV2(result, {
        assetIds: new Set(),
        itemObjectIds: new Set([ids.item]),
        globalVariables: new Map([[ids.variable, "BOOLEAN"]]),
        playerVariables: new Map(),
        sceneVariables: new Map(),
      }),
    ).toEqual([]);
    expect(
      MiniGameResultV2.safeParse({
        outcome: "FAILED",
        score: 0,
        rewards: [],
        javascript: "run()",
      }).success,
    ).toBe(false);
  });

  it("bounds score reward amounts symmetrically", () => {
    const result = (amount: number) => ({
      outcome: "SUCCESS",
      score: 0,
      rewards: [{ type: "SCORE", amount }],
    });
    expect(
      MiniGameResultV2.safeParse(result(V2_MINI_GAME_LIMITS.score)).success,
    ).toBe(true);
    expect(
      MiniGameResultV2.safeParse(result(-V2_MINI_GAME_LIMITS.score)).success,
    ).toBe(true);
    expect(
      MiniGameResultV2.safeParse(result(V2_MINI_GAME_LIMITS.score + 1)).success,
    ).toBe(false);
    expect(
      MiniGameResultV2.safeParse(result(-V2_MINI_GAME_LIMITS.score - 1))
        .success,
    ).toBe(false);
  });

  it("rejects reward values that mismatch the referenced variable type", () => {
    const result = MiniGameResultV2.parse({
      outcome: "SUCCESS",
      score: 1,
      rewards: [
        {
          type: "VARIABLE",
          variable: { scope: "GLOBAL", variableId: ids.variable },
          value: true,
        },
      ],
    });
    expect(
      validateMiniGameResultV2(result, {
        assetIds: new Set(),
        itemObjectIds: new Set(),
        globalVariables: new Map([[ids.variable, "NUMBER"]]),
        playerVariables: new Map(),
        sceneVariables: new Map(),
      }),
    ).toContain("Mini-game reward value does not match its variable type");
  });

  it("rejects executable functions and vendor/editor state", () => {
    expect(
      MiniGameDefinitionV2.safeParse({
        ...base("REACTION", {
          rounds: 1,
          minimumDelayMs: 0,
          maximumDelayMs: 0,
          responseTimeoutMs: 1,
        }),
        handler: () => undefined,
      }).success,
    ).toBe(false);
    expect(
      MiniGameDefinitionV2.safeParse({
        ...base("REACTION", {
          rounds: 1,
          minimumDelayMs: 0,
          maximumDelayMs: 0,
          responseTimeoutMs: 1,
        }),
        reactFlow: { nodes: [] },
      }).success,
    ).toBe(false);
  });
});
