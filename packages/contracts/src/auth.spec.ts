import { describe, expect, it } from 'vitest';
import { LoginInput, RegisterInput } from './auth.js';

for (const [name, schema] of Object.entries({ RegisterInput, LoginInput })) {
  describe(name, () => {
    it.each(['Abcdef1!', 'Abcdefg1!', 'A1!' + 'a'.repeat(125)])('accepts a compliant password and normalizes email', (password) => {
      expect(schema.parse({ email: ' DEV@Example.com ', password })).toEqual({ email: 'dev@example.com', password });
    });
    it.each(['Abcde1!', 'A1!' + 'a'.repeat(126), 'abcdefgh1!', 'ABCDEFGH1!', 'Abcdefghi!', 'Abcdefghi1', 'Abcdefghi1 ', 'Abcdefghi1é'])('rejects a password missing a requirement', (password) => {
      expect(schema.safeParse({ email: 'dev@example.com', password }).success).toBe(false);
    });
    it('does not trim the password', () => {
      const password = ' Abcdef1! ';
      expect(schema.parse({ email: 'dev@example.com', password }).password).toBe(password);
    });
  });
}
