import { EngineProjectV1 } from "./project-schema.js";
import { EngineProjectV2 } from "./v2/project-schema.js";

export type EngineProjectReadResult =
  | { status: "SUPPORTED"; project: EngineProjectV1 | EngineProjectV2 }
  | { status: "INVALID"; raw: unknown; diagnostics: string[] }
  | {
      status: "UNSUPPORTED_FUTURE_SCHEMA";
      raw: unknown;
      schemaVersion: number;
    };

export type ReadEngineProjectResult = EngineProjectReadResult;

export function readEngineProject(raw: unknown): EngineProjectReadResult {
  if (
    typeof raw === "object" &&
    raw !== null &&
    "schemaVersion" in raw &&
    typeof raw.schemaVersion === "number" &&
    Number.isInteger(raw.schemaVersion) &&
    raw.schemaVersion > 2
  ) {
    return {
      status: "UNSUPPORTED_FUTURE_SCHEMA",
      raw,
      schemaVersion: raw.schemaVersion,
    };
  }

  const parsed =
    typeof raw === "object" &&
    raw !== null &&
    "schemaVersion" in raw &&
    raw.schemaVersion === 2
      ? EngineProjectV2.safeParse(raw)
      : EngineProjectV1.safeParse(raw);
  if (parsed.success) return { status: "SUPPORTED", project: parsed.data };
  return {
    status: "INVALID",
    raw,
    diagnostics: parsed.error.issues.map((issue) => issue.message),
  };
}
