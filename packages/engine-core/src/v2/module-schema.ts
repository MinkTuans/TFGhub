import { z } from "zod";
import { StableId } from "../stable-id.js";
import { VariableReferenceV2 } from "./event-schema.js";

export const V2_MINI_GAME_TYPES = [
  "QUIZ",
  "PUZZLE",
  "MEMORY",
  "DRAG_DROP",
  "REACTION",
] as const;

export const V2_MINI_GAME_LIMITS = Object.freeze({
  questions: 200,
  choicesPerQuestion: 12,
  pieces: 500,
  cards: 200,
  dragItems: 500,
  targets: 200,
  rewards: 100,
  text: 2_000,
  timeMs: 86_400_000,
  coordinate: 65_536,
  score: 1_000_000_000,
});

const finite = z.number().finite();
const timeLimit = finite.positive().max(V2_MINI_GAME_LIMITS.timeMs).nullable();
const coordinate = finite
  .min(-V2_MINI_GAME_LIMITS.coordinate)
  .max(V2_MINI_GAME_LIMITS.coordinate);
const boundedText = z.string().trim().min(1).max(V2_MINI_GAME_LIMITS.text);

function duplicateIds(
  values: readonly { id: string }[],
  context: z.RefinementCtx,
  path: string,
) {
  const ids = new Set<string>();
  values.forEach((value, index) => {
    if (ids.has(value.id)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Stable IDs must be unique within a mini-game",
        path: [path, index, "id"],
      });
    }
    ids.add(value.id);
  });
}

const QuizChoice = z.object({ id: StableId, text: boundedText }).strict();
const QuizQuestion = z
  .object({
    id: StableId,
    prompt: boundedText,
    choices: z
      .array(QuizChoice)
      .min(1)
      .max(V2_MINI_GAME_LIMITS.choicesPerQuestion),
    correctChoiceId: StableId,
    points: finite.nonnegative().max(V2_MINI_GAME_LIMITS.score),
  })
  .strict()
  .superRefine((question, context) => {
    duplicateIds(question.choices, context, "choices");
    if (
      !question.choices.some((choice) => choice.id === question.correctChoiceId)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Quiz correct choice must exist",
        path: ["correctChoiceId"],
      });
    }
  });

const QuizConfig = z
  .object({
    questions: z.array(QuizQuestion).min(1).max(V2_MINI_GAME_LIMITS.questions),
    passScore: finite.nonnegative().max(V2_MINI_GAME_LIMITS.score),
    shuffleQuestions: z.boolean(),
    timeLimitMs: timeLimit,
  })
  .strict()
  .superRefine((config, context) => {
    duplicateIds(config.questions, context, "questions");
    const availableScore = config.questions.reduce(
      (total, question) => total + question.points,
      0,
    );
    if (config.passScore > availableScore) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Quiz pass score must be achievable",
        path: ["passScore"],
      });
    }
  });

const PuzzlePiece = z
  .object({
    id: StableId,
    assetId: StableId,
    startX: coordinate,
    startY: coordinate,
    targetX: coordinate,
    targetY: coordinate,
  })
  .strict();
const PuzzleConfig = z
  .object({
    board: z
      .object({
        width: finite.positive().max(V2_MINI_GAME_LIMITS.coordinate),
        height: finite.positive().max(V2_MINI_GAME_LIMITS.coordinate),
      })
      .strict(),
    pieces: z.array(PuzzlePiece).min(1).max(V2_MINI_GAME_LIMITS.pieces),
    tolerance: finite.nonnegative().max(V2_MINI_GAME_LIMITS.coordinate),
    timeLimitMs: timeLimit,
  })
  .strict()
  .superRefine((config, context) => {
    duplicateIds(config.pieces, context, "pieces");
    config.pieces.forEach((piece, index) => {
      const outsideBoard =
        piece.startX < 0 ||
        piece.startX > config.board.width ||
        piece.targetX < 0 ||
        piece.targetX > config.board.width ||
        piece.startY < 0 ||
        piece.startY > config.board.height ||
        piece.targetY < 0 ||
        piece.targetY > config.board.height;
      if (outsideBoard) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Puzzle piece coordinates must be inside the board",
          path: ["pieces", index],
        });
      }
    });
    if (config.tolerance > Math.min(config.board.width, config.board.height)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Puzzle tolerance must fit inside the board",
        path: ["tolerance"],
      });
    }
  });

const MemoryCard = z
  .object({
    id: StableId,
    pairKey: z.string().trim().min(1).max(120),
    assetId: StableId,
  })
  .strict();
const MemoryConfig = z
  .object({
    cards: z.array(MemoryCard).min(2).max(V2_MINI_GAME_LIMITS.cards),
    columns: z.number().int().positive().max(20),
    previewMs: finite.nonnegative().max(V2_MINI_GAME_LIMITS.timeMs),
  })
  .strict()
  .superRefine((config, context) => {
    duplicateIds(config.cards, context, "cards");
    const pairs = new Map<string, number>();
    config.cards.forEach((card) =>
      pairs.set(card.pairKey, (pairs.get(card.pairKey) ?? 0) + 1),
    );
    if ([...pairs.values()].some((count) => count !== 2)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Memory pair keys must occur exactly twice",
        path: ["cards"],
      });
    }
  });

const DragItem = z
  .object({ id: StableId, assetId: StableId, targetId: StableId })
  .strict();
const DropTarget = z
  .object({ id: StableId, assetId: StableId, label: boundedText })
  .strict();
const DragDropConfig = z
  .object({
    items: z.array(DragItem).min(1).max(V2_MINI_GAME_LIMITS.dragItems),
    targets: z.array(DropTarget).min(1).max(V2_MINI_GAME_LIMITS.targets),
    timeLimitMs: timeLimit,
  })
  .strict()
  .superRefine((config, context) => {
    duplicateIds(config.items, context, "items");
    duplicateIds(config.targets, context, "targets");
    const targets = new Set(config.targets.map((target) => target.id));
    config.items.forEach((item, index) => {
      if (!targets.has(item.targetId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Drag item target must exist",
          path: ["items", index, "targetId"],
        });
      }
    });
  });

const ReactionConfig = z
  .object({
    rounds: z.number().int().positive().max(100),
    minimumDelayMs: finite.nonnegative().max(V2_MINI_GAME_LIMITS.timeMs),
    maximumDelayMs: finite.nonnegative().max(V2_MINI_GAME_LIMITS.timeMs),
    responseTimeoutMs: finite.positive().max(V2_MINI_GAME_LIMITS.timeMs),
  })
  .strict()
  .superRefine((config, context) => {
    if (config.minimumDelayMs > config.maximumDelayMs) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Reaction minimum delay must not exceed maximum delay",
        path: ["minimumDelayMs"],
      });
    }
  });

const common = {
  id: StableId,
  version: z.literal(1),
  name: z.string().trim().min(1).max(120),
};

export const MiniGameDefinitionV2 = z
  .discriminatedUnion("type", [
    z
      .object({ ...common, type: z.literal("QUIZ"), config: QuizConfig })
      .strict(),
    z
      .object({ ...common, type: z.literal("PUZZLE"), config: PuzzleConfig })
      .strict(),
    z
      .object({ ...common, type: z.literal("MEMORY"), config: MemoryConfig })
      .strict(),
    z
      .object({
        ...common,
        type: z.literal("DRAG_DROP"),
        config: DragDropConfig,
      })
      .strict(),
    z
      .object({
        ...common,
        type: z.literal("REACTION"),
        config: ReactionConfig,
      })
      .strict(),
  ])
  .superRefine((definition, context) => {
    const ids = new Set([definition.id]);
    const add = (id: string, path: (string | number)[]) => {
      if (ids.has(id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Stable IDs must be unique within a mini-game",
          path,
        });
      }
      ids.add(id);
    };
    if (definition.type === "QUIZ") {
      definition.config.questions.forEach((question, questionIndex) => {
        add(question.id, ["config", "questions", questionIndex, "id"]);
        question.choices.forEach((choice, choiceIndex) =>
          add(choice.id, [
            "config",
            "questions",
            questionIndex,
            "choices",
            choiceIndex,
            "id",
          ]),
        );
      });
    } else if (definition.type === "PUZZLE") {
      definition.config.pieces.forEach((piece, index) =>
        add(piece.id, ["config", "pieces", index, "id"]),
      );
    } else if (definition.type === "MEMORY") {
      definition.config.cards.forEach((card, index) =>
        add(card.id, ["config", "cards", index, "id"]),
      );
    } else if (definition.type === "DRAG_DROP") {
      definition.config.items.forEach((item, index) =>
        add(item.id, ["config", "items", index, "id"]),
      );
      definition.config.targets.forEach((target, index) =>
        add(target.id, ["config", "targets", index, "id"]),
      );
    }
  });

export type MiniGameDefinitionV2 = z.infer<typeof MiniGameDefinitionV2>;

type MiniGameDefinition = {
  version: 1;
  runtimeHandlerKey: string;
  schema: z.ZodTypeAny;
};

export const v2MiniGameRegistry: Record<
  (typeof V2_MINI_GAME_TYPES)[number],
  MiniGameDefinition
> = {
  QUIZ: {
    version: 1,
    runtimeHandlerKey: "tfg.mini-game.quiz.v1",
    schema: QuizConfig,
  },
  PUZZLE: {
    version: 1,
    runtimeHandlerKey: "tfg.mini-game.puzzle.v1",
    schema: PuzzleConfig,
  },
  MEMORY: {
    version: 1,
    runtimeHandlerKey: "tfg.mini-game.memory.v1",
    schema: MemoryConfig,
  },
  DRAG_DROP: {
    version: 1,
    runtimeHandlerKey: "tfg.mini-game.drag-drop.v1",
    schema: DragDropConfig,
  },
  REACTION: {
    version: 1,
    runtimeHandlerKey: "tfg.mini-game.reaction.v1",
    schema: ReactionConfig,
  },
};

const Reward = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("ITEM"),
      itemId: StableId,
      quantity: z.number().int().positive().max(1_000_000),
    })
    .strict(),
  z
    .object({
      type: z.literal("VARIABLE"),
      variable: VariableReferenceV2,
      value: z.union([z.boolean(), finite, z.string().max(2_000)]),
    })
    .strict(),
  z
    .object({
      type: z.literal("SCORE"),
      amount: finite
        .min(-V2_MINI_GAME_LIMITS.score)
        .max(V2_MINI_GAME_LIMITS.score),
    })
    .strict(),
]);

export const MiniGameResultV2 = z
  .object({
    outcome: z.enum(["SUCCESS", "FAILED"]),
    score: finite
      .min(-V2_MINI_GAME_LIMITS.score)
      .max(V2_MINI_GAME_LIMITS.score),
    rewards: z.array(Reward).max(V2_MINI_GAME_LIMITS.rewards),
  })
  .strict();
export type MiniGameResultV2 = z.infer<typeof MiniGameResultV2>;

export type V2MiniGameValidationContext = {
  assetIds: ReadonlySet<string>;
  itemObjectIds: ReadonlySet<string>;
  globalVariables: ReadonlyMap<string, V2MiniGameVariableType>;
  playerVariables: ReadonlyMap<string, V2MiniGameVariableType>;
  sceneVariables: ReadonlyMap<
    string,
    ReadonlyMap<string, V2MiniGameVariableType>
  >;
};

export type V2MiniGameVariableType = "STRING" | "NUMBER" | "BOOLEAN";

function missingAsset(
  diagnostics: string[],
  assetId: string,
  context: V2MiniGameValidationContext,
) {
  if (
    !context.assetIds.has(assetId) &&
    !diagnostics.includes("Mini-game references an asset that does not exist")
  ) {
    diagnostics.push("Mini-game references an asset that does not exist");
  }
}

export function validateMiniGameDefinitionV2(
  definition: MiniGameDefinitionV2,
  context: V2MiniGameValidationContext,
): string[] {
  const diagnostics: string[] = [];
  if (definition.type === "PUZZLE") {
    definition.config.pieces.forEach((piece) =>
      missingAsset(diagnostics, piece.assetId, context),
    );
  } else if (definition.type === "MEMORY") {
    definition.config.cards.forEach((card) =>
      missingAsset(diagnostics, card.assetId, context),
    );
  } else if (definition.type === "DRAG_DROP") {
    definition.config.items.forEach((item) =>
      missingAsset(diagnostics, item.assetId, context),
    );
    definition.config.targets.forEach((target) =>
      missingAsset(diagnostics, target.assetId, context),
    );
  }
  return diagnostics;
}

function variableType(
  reference: z.infer<typeof VariableReferenceV2>,
  context: V2MiniGameValidationContext,
): V2MiniGameVariableType | undefined {
  if (reference.scope === "GLOBAL") {
    return context.globalVariables.get(reference.variableId);
  }
  if (reference.scope === "PLAYER") {
    return context.playerVariables.get(reference.variableId);
  }
  return context.sceneVariables
    .get(reference.sceneId)
    ?.get(reference.variableId);
}

export function validateMiniGameResultV2(
  result: MiniGameResultV2,
  context: V2MiniGameValidationContext,
): string[] {
  const diagnostics: string[] = [];
  result.rewards.forEach((reward) => {
    if (reward.type === "ITEM" && !context.itemObjectIds.has(reward.itemId)) {
      diagnostics.push(
        "Mini-game reward references an item that does not exist",
      );
    } else if (reward.type === "VARIABLE") {
      const expected = variableType(reward.variable, context);
      if (!expected) {
        diagnostics.push(
          "Mini-game reward references a variable outside its declared scope",
        );
      } else if (typeof reward.value !== expected.toLowerCase()) {
        diagnostics.push(
          "Mini-game reward value does not match its variable type",
        );
      }
    }
  });
  return diagnostics;
}
