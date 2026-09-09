import { describe, expect, it } from "vitest";
import {
  EventConditionV2,
  EventStepV2,
  EventTriggerV2,
  GameEventV2,
  V2_CONDITION_TYPES,
  V2_EVENT_LIMITS,
  V2_EVENT_STEP_TYPES,
  V2_TRIGGER_TYPES,
} from "./event-schema.js";
import {
  validateGameEventV2,
  type V2EventValidationContext,
} from "./event-validation.js";

const id = (suffix: string) => `550e8400-e29b-41d4-a716-44665544${suffix}`;

const ids = {
  event: id("0001"),
  condition: id("0002"),
  step: id("0003"),
  scene: id("0004"),
  object: id("0005"),
  component: id("0006"),
  animator: id("0014"),
  health: id("0015"),
  asset: id("0007"),
  variable: id("0008"),
  choice: id("0009"),
  script: id("0010"),
  module: id("0011"),
  prefab: id("0012"),
};

const versioned = (value: Record<string, unknown>, suffix = "0002") => ({
  id: id(suffix),
  version: 1,
  ...value,
});

function event(overrides: Record<string, unknown> = {}) {
  return {
    id: ids.event,
    version: 1,
    name: "Opening",
    enabled: true,
    order: 0,
    trigger: { type: "ON_START" },
    condition: null,
    steps: [versioned({ type: "ADD_SCORE", amount: 1 }, "0003")],
    ...overrides,
  };
}

describe("V2 visual event structural schema", () => {
  it("accepts the complete trigger vocabulary and retains every V1 trigger semantic", () => {
    expect(V2_TRIGGER_TYPES).toEqual([
      "ON_START",
      "ON_CLICK",
      "ON_INTERACT",
      "ON_COLLISION",
      "ON_ENTER_AREA",
      "ON_EXIT_AREA",
      "ON_COLLECT_ITEM",
      "ON_TIMER",
      "ON_VARIABLE_CHANGED",
      "ON_KEY_PRESS",
      "ON_DIALOGUE_END",
      "ON_CHOICE_SELECTED",
      "CUSTOM",
    ]);
    const triggers = [
      { type: "ON_START" },
      { type: "ON_CLICK", objectId: ids.object },
      { type: "ON_INTERACT", objectId: ids.object },
      {
        type: "ON_COLLISION",
        firstObjectId: ids.object,
        secondObjectId: ids.prefab,
      },
      {
        type: "ON_ENTER_AREA",
        areaObjectId: ids.object,
        enteringObjectId: null,
      },
      { type: "ON_EXIT_AREA", areaObjectId: ids.object, exitingObjectId: null },
      {
        type: "ON_COLLECT_ITEM",
        itemObjectId: ids.object,
        collectorObjectId: null,
      },
      { type: "ON_TIMER", delayMs: 100, repeat: true, intervalMs: 500 },
      {
        type: "ON_VARIABLE_CHANGED",
        variable: { scope: "GLOBAL", variableId: ids.variable },
      },
      { type: "ON_KEY_PRESS", key: "ArrowLeft", repeat: false },
      {
        type: "ON_DIALOGUE_END",
        objectId: ids.object,
        componentId: ids.component,
      },
      {
        type: "ON_CHOICE_SELECTED",
        objectId: ids.object,
        componentId: ids.component,
        choiceId: ids.choice,
      },
      {
        type: "CUSTOM",
        registryKey: "tfg.trigger.quest-ready.v1",
        config: { quest: "intro" },
      },
    ];
    triggers.forEach((trigger) =>
      expect(EventTriggerV2.safeParse(trigger).success, trigger.type).toBe(
        true,
      ),
    );
  });

  it("accepts the complete condition vocabulary with stable nested IDs", () => {
    expect(V2_CONDITION_TYPES).toEqual([
      "ALL",
      "ANY",
      "NOT",
      "VARIABLE_COMPARE",
      "ITEM_OWNED",
      "QUEST_STATE",
      "SCORE_COMPARE",
      "RANDOM_CHANCE",
      "PLAYER_POSITION",
      "OBJECT_EXISTS",
      "HAS_COMPONENT",
      "CUSTOM",
    ]);
    const leaves = [
      {
        type: "VARIABLE_COMPARE",
        variable: { scope: "GLOBAL", variableId: ids.variable },
        operator: "EQUALS",
        value: true,
      },
      { type: "ITEM_OWNED", itemId: ids.object, quantity: 1 },
      { type: "QUEST_STATE", questComponentId: ids.component, state: "ACTIVE" },
      { type: "SCORE_COMPARE", operator: "GREATER_THAN_OR_EQUAL", value: 80 },
      { type: "RANDOM_CHANCE", probability: 0.5 },
      { type: "PLAYER_POSITION", sceneId: ids.scene, x: 10, y: 20, radius: 5 },
      { type: "OBJECT_EXISTS", objectId: ids.object },
      {
        type: "HAS_COMPONENT",
        objectId: ids.object,
        componentId: ids.component,
      },
      {
        type: "CUSTOM",
        registryKey: "tfg.condition.daytime.v1",
        config: { hour: 12 },
      },
    ];
    leaves.forEach((condition, index) =>
      expect(
        EventConditionV2.safeParse(
          versioned(condition, String(20 + index).padStart(4, "0")),
        ).success,
        condition.type,
      ).toBe(true),
    );
    expect(
      EventConditionV2.safeParse(
        versioned({ type: "ALL", conditions: [versioned(leaves[0]!, "0030")] }),
      ).success,
    ).toBe(true);
    expect(
      EventConditionV2.safeParse(
        versioned({ type: "ANY", conditions: [versioned(leaves[1]!, "0031")] }),
      ).success,
    ).toBe(true);
    expect(
      EventConditionV2.safeParse(
        versioned({ type: "NOT", condition: versioned(leaves[2]!, "0032") }),
      ).success,
    ).toBe(true);
  });

  it("accepts the complete ordered action and control-flow vocabulary", () => {
    expect(V2_EVENT_STEP_TYPES).toEqual([
      "SHOW_DIALOGUE",
      "CHANGE_SCENE",
      "MOVE_OBJECT",
      "PLAY_ANIMATION",
      "PLAY_AUDIO",
      "STOP_AUDIO",
      "ADD_ITEM",
      "REMOVE_ITEM",
      "CHANGE_VARIABLE",
      "START_MINI_GAME",
      "SHOW_UI",
      "HIDE_UI",
      "SPAWN_OBJECT",
      "DESTROY_OBJECT",
      "RUN_SCRIPT",
      "ADD_SCORE",
      "CHANGE_HEALTH",
      "COMPLETE_GAME",
      "CUSTOM",
      "SEQUENCE",
      "WAIT",
      "IF_ELSE",
      "REPEAT",
    ]);
    const leaves = [
      {
        type: "SHOW_DIALOGUE",
        objectId: ids.object,
        componentId: ids.component,
      },
      { type: "CHANGE_SCENE", sceneId: ids.scene },
      {
        type: "MOVE_OBJECT",
        objectId: ids.object,
        x: 1,
        y: 2,
        durationMs: 100,
      },
      {
        type: "PLAY_ANIMATION",
        objectId: ids.object,
        componentId: ids.component,
        clip: "walk",
      },
      { type: "PLAY_AUDIO", assetId: ids.asset },
      { type: "STOP_AUDIO", assetId: ids.asset },
      { type: "ADD_ITEM", itemId: ids.object, quantity: 1 },
      { type: "REMOVE_ITEM", itemId: ids.object, quantity: 1 },
      {
        type: "CHANGE_VARIABLE",
        variable: { scope: "GLOBAL", variableId: ids.variable },
        operation: "SET",
        value: 2,
      },
      { type: "START_MINI_GAME", moduleId: ids.module },
      { type: "SHOW_UI", objectId: ids.object },
      { type: "HIDE_UI", objectId: ids.object },
      {
        type: "SPAWN_OBJECT",
        prefabId: ids.prefab,
        sceneId: ids.scene,
        x: 1,
        y: 2,
      },
      { type: "DESTROY_OBJECT", objectId: ids.object },
      { type: "RUN_SCRIPT", scriptId: ids.script },
      { type: "ADD_SCORE", amount: 10 },
      {
        type: "CHANGE_HEALTH",
        objectId: ids.object,
        componentId: ids.component,
        amount: -5,
      },
      { type: "COMPLETE_GAME" },
      {
        type: "CUSTOM",
        registryKey: "tfg.action.camera-shake.v1",
        config: { strength: 2 },
      },
      { type: "WAIT", durationMs: 250 },
    ];
    leaves.forEach((step, index) =>
      expect(
        EventStepV2.safeParse(
          versioned(step, String(100 + index).padStart(4, "0")),
        ).success,
        step.type,
      ).toBe(true),
    );
    const child = versioned({ type: "ADD_SCORE", amount: 1 }, "0200");
    expect(
      EventStepV2.safeParse(
        versioned({ type: "SEQUENCE", steps: [child] }, "0201"),
      ).success,
    ).toBe(true);
    expect(
      EventStepV2.safeParse(
        versioned(
          {
            type: "IF_ELSE",
            condition: versioned(
              { type: "SCORE_COMPARE", operator: "GREATER_THAN", value: 1 },
              "0202",
            ),
            thenSteps: [child],
            elseSteps: [],
          },
          "0203",
        ),
      ).success,
    ).toBe(true);
    expect(
      EventStepV2.safeParse(
        versioned({ type: "REPEAT", times: 3, steps: [child] }, "0204"),
      ).success,
    ).toBe(true);
  });

  it("enforces depth, children, steps, delay, and repeat budgets", () => {
    const leaf = versioned({ type: "ADD_SCORE", amount: 1 }, "0300");
    expect(
      EventStepV2.safeParse(
        versioned(
          { type: "WAIT", durationMs: V2_EVENT_LIMITS.maxDelayMs + 1 },
          "0301",
        ),
      ).success,
    ).toBe(false);
    expect(
      EventStepV2.safeParse(
        versioned(
          {
            type: "REPEAT",
            times: V2_EVENT_LIMITS.maxRepeat + 1,
            steps: [leaf],
          },
          "0302",
        ),
      ).success,
    ).toBe(false);
    expect(GameEventV2.safeParse(event({ steps: [] })).success).toBe(false);
    expect(
      GameEventV2.safeParse(
        event({
          steps: Array.from({ length: V2_EVENT_LIMITS.steps + 1 }, (_, index) =>
            versioned(
              { type: "ADD_SCORE", amount: 1 },
              (0x400 + index).toString(16).padStart(4, "0"),
            ),
          ),
        }),
      ).success,
    ).toBe(false);

    let deepCondition: unknown = versioned(
      { type: "OBJECT_EXISTS", objectId: ids.object },
      "0500",
    );
    for (let depth = 1; depth <= V2_EVENT_LIMITS.conditionDepth; depth += 1)
      deepCondition = versioned(
        { type: "NOT", condition: deepCondition },
        (0x500 + depth).toString(16).padStart(4, "0"),
      );
    expect(EventConditionV2.safeParse(deepCondition).success).toBe(false);

    let deepStep: unknown = leaf;
    for (let depth = 1; depth <= V2_EVENT_LIMITS.controlDepth; depth += 1)
      deepStep = versioned(
        { type: "SEQUENCE", steps: [deepStep] },
        (0x600 + depth).toString(16).padStart(4, "0"),
      );
    expect(EventStepV2.safeParse(deepStep).success).toBe(false);
  });

  it("enforces the total step budget across separate nested roots", () => {
    const branch = (base: number) =>
      versioned(
        {
          type: "SEQUENCE",
          steps: Array.from({ length: 31 }, (_, index) =>
            versioned(
              { type: "ADD_SCORE", amount: 1 },
              (base + index).toString(16).padStart(4, "0"),
            ),
          ),
        },
        (base - 1).toString(16).padStart(4, "0"),
      );
    expect(
      GameEventV2.safeParse(
        event({
          steps: Array.from({ length: 7 }, (_, index) =>
            branch(0x1000 + index * 0x100),
          ),
        }),
      ).success,
    ).toBe(false);
  });

  it("enforces condition and control child limits directly", () => {
    const conditions = Array.from(
      { length: V2_EVENT_LIMITS.conditionChildren + 1 },
      (_, index) =>
        versioned(
          { type: "OBJECT_EXISTS", objectId: ids.object },
          (0x3000 + index).toString(16).padStart(4, "0"),
        ),
    );
    const steps = Array.from(
      { length: V2_EVENT_LIMITS.controlChildren + 1 },
      (_, index) =>
        versioned(
          { type: "ADD_SCORE", amount: 1 },
          (0x4000 + index).toString(16).padStart(4, "0"),
        ),
    );
    expect(
      EventConditionV2.safeParse(versioned({ type: "ALL", conditions }, "2999"))
        .success,
    ).toBe(false);
    expect(
      EventStepV2.safeParse(versioned({ type: "SEQUENCE", steps }, "3999"))
        .success,
    ).toBe(false);
  });

  it("rejects arbitrary executable values, JavaScript fields, unknown fields, and vendor graph state", () => {
    expect(
      EventTriggerV2.safeParse({
        type: "CUSTOM",
        registryKey: "tfg.trigger.x.v1",
        config: { handler: () => undefined },
      }).success,
    ).toBe(false);
    expect(
      EventStepV2.safeParse(
        versioned({
          type: "RUN_SCRIPT",
          scriptId: ids.script,
          javascript: "run()",
        }),
      ).success,
    ).toBe(false);
    expect(
      GameEventV2.safeParse({ ...event(), reactFlow: { nodes: [], edges: [] } })
        .success,
    ).toBe(false);
  });

  it("rejects non-plain arrays inside custom configuration", () => {
    class CustomArray<T> extends Array<T> {}
    expect(
      EventTriggerV2.safeParse({
        type: "CUSTOM",
        registryKey: "tfg.trigger.x.v1",
        config: { values: new CustomArray(1, 2) },
      }).success,
    ).toBe(false);
  });

  it("returns diagnostics for cyclic conditions and control flow without throwing", () => {
    const condition: Record<string, unknown> = versioned({ type: "NOT" });
    condition.condition = condition;
    const step: Record<string, unknown> = versioned(
      { type: "SEQUENCE" },
      "0003",
    );
    step.steps = [step];
    expect(() => EventConditionV2.safeParse(condition)).not.toThrow();
    expect(() => EventStepV2.safeParse(step)).not.toThrow();
    const conditionResult = EventConditionV2.safeParse(condition);
    const stepResult = EventStepV2.safeParse(step);
    expect(conditionResult.success).toBe(false);
    expect(stepResult.success).toBe(false);
    if (!conditionResult.success) {
      expect(
        conditionResult.error.issues.some((issue) =>
          issue.message.includes("cycle"),
        ),
      ).toBe(true);
    }
    if (!stepResult.success) {
      expect(
        stepResult.error.issues.some((issue) =>
          issue.message.includes("cycle"),
        ),
      ).toBe(true);
    }
  });
});

describe("V2 visual event semantic validation", () => {
  const context: V2EventValidationContext = {
    sceneIds: new Set([ids.scene]),
    objectIds: new Set([ids.object]),
    objectTypes: new Map([[ids.object, "NPC"]]),
    components: new Map([
      [ids.component, { objectId: ids.object, type: "Dialogue" }],
    ]),
    assetIds: new Set([ids.asset]),
    prefabIds: new Set([ids.prefab]),
    globalVariables: new Map([[ids.variable, "NUMBER"]]),
    playerVariables: new Map(),
    sceneVariables: new Map(),
    dialogueChoiceIds: new Set([ids.choice]),
    dialogueChoices: new Map([[ids.choice, ids.component]]),
    scriptIds: new Set([ids.script]),
    moduleIds: new Set([ids.module]),
    customTriggerKeys: new Set(["tfg.trigger.quest-ready.v1"]),
    customConditionKeys: new Set(["tfg.condition.daytime.v1"]),
    customActionKeys: new Set(["tfg.action.camera-shake.v1"]),
  };

  it("accepts valid typed references and scope-compatible values", () => {
    expect(
      validateGameEventV2(
        GameEventV2.parse(
          event({
            trigger: {
              type: "ON_VARIABLE_CHANGED",
              variable: { scope: "GLOBAL", variableId: ids.variable },
            },
            steps: [
              versioned(
                {
                  type: "CHANGE_VARIABLE",
                  variable: { scope: "GLOBAL", variableId: ids.variable },
                  operation: "ADD",
                  value: 2,
                },
                "0003",
              ),
            ],
          }),
        ),
        context,
      ),
    ).toEqual([]);
  });

  it("accepts moving and destroying an existing world object", () => {
    const steps = [
      versioned(
        {
          type: "MOVE_OBJECT",
          objectId: ids.object,
          x: 10,
          y: 20,
          durationMs: 100,
        },
        "0003",
      ),
      versioned({ type: "DESTROY_OBJECT", objectId: ids.object }, "0013"),
    ];
    expect(
      validateGameEventV2(GameEventV2.parse(event({ steps })), context),
    ).toEqual([]);
  });

  it("accepts correctly owned component-typed actions", () => {
    const typedContext = {
      ...context,
      components: new Map([
        [ids.component, { objectId: ids.object, type: "Dialogue" as const }],
        [ids.animator, { objectId: ids.object, type: "Animator" as const }],
        [ids.health, { objectId: ids.object, type: "Health" as const }],
      ]),
    };
    const steps = [
      versioned(
        {
          type: "SHOW_DIALOGUE",
          objectId: ids.object,
          componentId: ids.component,
        },
        "0003",
      ),
      versioned(
        {
          type: "PLAY_ANIMATION",
          objectId: ids.object,
          componentId: ids.animator,
          clip: "walk",
        },
        "0013",
      ),
      versioned(
        {
          type: "CHANGE_HEALTH",
          objectId: ids.object,
          componentId: ids.health,
          amount: -1,
        },
        "0023",
      ),
    ];
    expect(
      validateGameEventV2(GameEventV2.parse(event({ steps })), typedContext),
    ).toEqual([]);
  });

  it.each([
    ["scene", versioned({ type: "CHANGE_SCENE", sceneId: id("0900") }, "0003")],
    [
      "object",
      versioned({ type: "DESTROY_OBJECT", objectId: id("0901") }, "0003"),
    ],
    ["asset", versioned({ type: "PLAY_AUDIO", assetId: id("0902") }, "0003")],
    [
      "prefab",
      versioned(
        {
          type: "SPAWN_OBJECT",
          prefabId: id("0903"),
          sceneId: ids.scene,
          x: 0,
          y: 0,
        },
        "0003",
      ),
    ],
    ["script", versioned({ type: "RUN_SCRIPT", scriptId: id("0904") }, "0003")],
    [
      "module",
      versioned({ type: "START_MINI_GAME", moduleId: id("0905") }, "0003"),
    ],
  ])("rejects a missing typed %s reference", (_kind, step) => {
    expect(
      validateGameEventV2(GameEventV2.parse(event({ steps: [step] })), context)
        .length,
    ).toBeGreaterThan(0);
  });

  it("rejects component ownership/type, variable scope/type, choice, and unregistered custom keys", () => {
    const badEvents = [
      event({
        trigger: {
          type: "ON_DIALOGUE_END",
          objectId: id("0910"),
          componentId: ids.component,
        },
      }),
      event({
        trigger: {
          type: "ON_CHOICE_SELECTED",
          objectId: ids.object,
          componentId: ids.component,
          choiceId: id("0911"),
        },
      }),
      event({
        condition: versioned({
          type: "VARIABLE_COMPARE",
          variable: { scope: "PLAYER", variableId: ids.variable },
          operator: "EQUALS",
          value: 1,
        }),
      }),
      event({
        steps: [
          versioned(
            {
              type: "CHANGE_VARIABLE",
              variable: { scope: "GLOBAL", variableId: ids.variable },
              operation: "SET",
              value: true,
            },
            "0003",
          ),
        ],
      }),
      event({
        trigger: { type: "CUSTOM", registryKey: "unknown.trigger", config: {} },
      }),
    ];
    badEvents.forEach((candidate) =>
      expect(
        validateGameEventV2(GameEventV2.parse(candidate), context).length,
      ).toBeGreaterThan(0),
    );
  });

  it("rejects object-role and dialogue-choice ownership mismatches", () => {
    const candidates = [
      event({
        trigger: {
          type: "ON_ENTER_AREA",
          areaObjectId: ids.object,
          enteringObjectId: null,
        },
      }),
      event({
        trigger: {
          type: "ON_COLLECT_ITEM",
          itemObjectId: ids.object,
          collectorObjectId: null,
        },
      }),
      event({
        trigger: {
          type: "ON_CHOICE_SELECTED",
          objectId: ids.object,
          componentId: ids.component,
          choiceId: ids.choice,
        },
      }),
      event({
        steps: [versioned({ type: "SHOW_UI", objectId: ids.object }, "0003")],
      }),
      event({
        steps: [
          versioned(
            { type: "ADD_ITEM", itemId: ids.object, quantity: 1 },
            "0003",
          ),
        ],
      }),
    ];
    const mismatched = {
      ...context,
      dialogueChoices: new Map([[ids.choice, id("0999")]]),
    };
    candidates.forEach((candidate) =>
      expect(
        validateGameEventV2(GameEventV2.parse(candidate), mismatched).length,
      ).toBeGreaterThan(0),
    );
  });

  it("rejects ordered comparison operators for boolean and string variables", () => {
    const booleanContext = {
      ...context,
      globalVariables: new Map([[ids.variable, "BOOLEAN" as const]]),
    };
    const candidate = event({
      condition: versioned({
        type: "VARIABLE_COMPARE",
        variable: { scope: "GLOBAL", variableId: ids.variable },
        operator: "GREATER_THAN",
        value: true,
      }),
    });
    expect(
      validateGameEventV2(GameEventV2.parse(candidate), booleanContext),
    ).toContain("Ordered comparison requires a number variable");
  });

  it("rejects duplicate stable IDs across the event, conditions, and nested steps", () => {
    const duplicate = event({
      condition: versioned(
        { type: "OBJECT_EXISTS", objectId: ids.object },
        "0003",
      ),
      steps: [
        versioned(
          {
            type: "SEQUENCE",
            steps: [versioned({ type: "ADD_SCORE", amount: 1 }, "0003")],
          },
          "0003",
        ),
      ],
    });
    expect(
      validateGameEventV2(GameEventV2.parse(duplicate), context),
    ).toContain("Stable IDs must be unique within an event");
  });
});
