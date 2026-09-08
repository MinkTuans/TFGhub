import { EngineProjectV1 } from './project-schema.js';

export type EngineProjectReadResult =
  | { status: 'SUPPORTED'; project: EngineProjectV1 }
  | { status: 'INVALID'; raw: unknown; diagnostics: string[] }
  | {
      status: 'UNSUPPORTED_FUTURE_SCHEMA';
      raw: unknown;
      schemaVersion: number;
    };

export function readEngineProject(raw: unknown): EngineProjectReadResult {
  if (
    typeof raw === 'object' &&
    raw !== null &&
    'schemaVersion' in raw &&
    typeof raw.schemaVersion === 'number' &&
    Number.isInteger(raw.schemaVersion) &&
    raw.schemaVersion > 1
  ) {
    return {
      status: 'UNSUPPORTED_FUTURE_SCHEMA',
      raw,
      schemaVersion: raw.schemaVersion,
    };
  }

  const parsed = EngineProjectV1.safeParse(raw);
  if (parsed.success) return { status: 'SUPPORTED', project: parsed.data };
  return {
    status: 'INVALID',
    raw,
    diagnostics: parsed.error.issues.map((issue) => issue.message),
  };
}
