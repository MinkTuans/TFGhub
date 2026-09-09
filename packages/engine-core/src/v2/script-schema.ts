import { z } from "zod";
import { StableId } from "../stable-id.js";

export const V2_SCRIPT_CAPABILITIES = [
  "GET_VARIABLE",
  "SET_VARIABLE",
  "CHANGE_SCENE",
  "SPAWN_OBJECT",
  "PLAY_AUDIO",
  "SHOW_DIALOGUE",
] as const;

export const V2_SCRIPT_LIMITS = Object.freeze({
  sourceBytes: 100_000,
  attachments: 100,
  capabilities: V2_SCRIPT_CAPABILITIES.length,
});

const ScriptAttachmentV2 = z.discriminatedUnion("type", [
  z
    .object({ id: StableId, type: z.literal("SCENE"), sceneId: StableId })
    .strict(),
  z
    .object({ id: StableId, type: z.literal("OBJECT"), objectId: StableId })
    .strict(),
  z
    .object({ id: StableId, type: z.literal("EVENT"), eventId: StableId })
    .strict(),
]);

export const ScriptResourceV2 = z
  .object({
    id: StableId,
    version: z.literal(1),
    name: z.string().trim().min(1).max(120),
    language: z.literal("JAVASCRIPT"),
    source: z
      .string()
      .refine(
        (value) =>
          new TextEncoder().encode(value).byteLength <=
          V2_SCRIPT_LIMITS.sourceBytes,
        "Script source exceeds its byte limit",
      ),
    capabilities: z
      .array(z.enum(V2_SCRIPT_CAPABILITIES))
      .max(V2_SCRIPT_LIMITS.capabilities),
    attachments: z.array(ScriptAttachmentV2).max(V2_SCRIPT_LIMITS.attachments),
  })
  .strict()
  .superRefine((script, context) => {
    const capabilities = new Set<string>();
    script.capabilities.forEach((capability, index) => {
      if (capabilities.has(capability)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Script capabilities must be unique",
          path: ["capabilities", index],
        });
      }
      capabilities.add(capability);
    });
    const attachmentIds = new Set<string>([script.id]);
    script.attachments.forEach((attachment, index) => {
      if (attachmentIds.has(attachment.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Script attachment IDs must be unique",
          path: ["attachments", index, "id"],
        });
      }
      attachmentIds.add(attachment.id);
    });
  });

export type ScriptResourceV2 = z.infer<typeof ScriptResourceV2>;

export type V2ScriptValidationContext = {
  sceneIds: ReadonlySet<string>;
  objectIds: ReadonlySet<string>;
  eventIds: ReadonlySet<string>;
};

export function validateScriptResourceV2(
  script: ScriptResourceV2,
  context: V2ScriptValidationContext,
): string[] {
  const diagnostics: string[] = [];
  script.attachments.forEach((attachment) => {
    if (
      attachment.type === "SCENE" &&
      !context.sceneIds.has(attachment.sceneId)
    ) {
      diagnostics.push("Script references a scene that does not exist");
    } else if (
      attachment.type === "OBJECT" &&
      !context.objectIds.has(attachment.objectId)
    ) {
      diagnostics.push("Script references an object that does not exist");
    } else if (
      attachment.type === "EVENT" &&
      !context.eventIds.has(attachment.eventId)
    ) {
      diagnostics.push("Script references an event that does not exist");
    }
  });
  return diagnostics;
}
