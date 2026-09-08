import { describe, expect, it } from 'vitest';
import { StableId, createStableId } from './stable-id.js';

describe('stable IDs', () => {
  it('accepts canonical UUIDs and normalizes their case', () => {
    expect(StableId.parse('550E8400-E29B-41D4-A716-446655440000')).toBe(
      '550e8400-e29b-41d4-a716-446655440000',
    );
  });

  it.each([
    '',
    'scene-1',
    '550e8400-e29b-41d4-a716-44665544000',
    '550e8400-e29b-61d4-a716-446655440000',
  ])('rejects an invalid stable ID: %s', (value) => {
    expect(StableId.safeParse(value).success).toBe(false);
  });

  it('creates a valid fresh stable ID', () => {
    const first = createStableId();
    const second = createStableId();

    expect(StableId.parse(first)).toBe(first);
    expect(StableId.parse(second)).toBe(second);
    expect(second).not.toBe(first);
  });
});
