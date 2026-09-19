import { describe, expect, it } from 'vitest';
import { validateWebEngineCapabilityContract } from './web-engine-capabilities.js';

describe('web engine capability contracts', () => {
  it('accepts a named runtime with distinct declared capabilities', () => {
    expect(
      validateWebEngineCapabilityContract({
        runtime: 'project-fixture',
        capabilities: ['wasm', 'blobUrl', 'blobWorker'],
      }),
    ).toEqual({
      runtime: 'project-fixture',
      capabilities: ['wasm', 'blobUrl', 'blobWorker'],
    });
  });

  it.each([
    { runtime: '', capabilities: ['wasm'] },
    { runtime: 'fixture', capabilities: [] },
    { runtime: 'fixture', capabilities: ['wasm', 'wasm'] },
    { runtime: 'fixture', capabilities: ['unknown'] },
  ])('rejects invalid contract %#', (value) => {
    expect(() => validateWebEngineCapabilityContract(value)).toThrow();
  });
});
