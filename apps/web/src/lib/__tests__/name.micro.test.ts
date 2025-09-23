import { describe, it, expect } from 'vitest';
import { getInitials } from '../name';

describe('getInitials edge cases', () => {
  it('handles null/empty -> You', () => {
    expect(getInitials(null)).toBe('You');
    expect(getInitials('')).toBe('You');
  });
  it('single word 1-2 letters', () => {
    expect(getInitials('a')).toBe('A');
    expect(getInitials('ab')).toBe('AB');
  });
  it('email strips domain and collapses whitespace', () => {
    expect(getInitials(' user.name@example.com ')).toBe('UN');
  });
  it('multi word takes first + last initials', () => {
    expect(getInitials('John Ronald Reuel Tolkien')).toBe('JT');
  });
});
