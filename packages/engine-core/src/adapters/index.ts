import type { LegacyAdapterResult } from './identity.js';
import { adaptPlatformerV0 } from './platformer-v0.js';
import { adaptStoryV0 } from './story-v0.js';

export {
  LEGACY_ID_NAMESPACE,
  uuidV5,
  type LegacyAdapterResult,
} from './identity.js';
export { adaptPlatformerV0 } from './platformer-v0.js';
export { adaptStoryV0 } from './story-v0.js';

export function adaptLegacyProject(gameId: string, source: unknown): LegacyAdapterResult {
  if (typeof source === 'object' && source !== null && 'sourceType' in source) {
    const sourceType = (source as { sourceType?: unknown }).sourceType;
    if (sourceType === 'CODE' || sourceType === 'UPLOAD') {
      return {
        status: 'UNSUPPORTED_SOURCE_TYPE',
        sourceType,
        raw: source,
        diagnostics: [`${sourceType} legacy projects are not supported by canonical adapters`],
      };
    }
    if (sourceType === 'STORY') return adaptStoryV0(gameId, source);
    if (sourceType === 'PLATFORMER') return adaptPlatformerV0(gameId, source);
  }
  return { status: 'INVALID_LEGACY', raw: source, diagnostics: ['sourceType: Unsupported legacy project type'] };
}
