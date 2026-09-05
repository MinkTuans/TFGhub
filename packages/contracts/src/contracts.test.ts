import { describe, expect, it } from 'vitest';
import { CreateGameInput, RegisterInput } from './index';

describe('contracts', () => {
  it('normalizes registration email', () => {
    expect(RegisterInput.parse({ email: ' DEV@EXAMPLE.COM ', password: 'password123' }).email)
      .toBe('dev@example.com');
  });

  it('rejects an invalid game slug', () => {
    expect(() => CreateGameInput.parse({ title: 'Demo', slug: 'Not Valid' })).toThrow();
  });
});
