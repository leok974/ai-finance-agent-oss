import { describe, it, expect } from 'vitest';
import { BASE, dashSlug } from './http';

describe('BASE derivation', () => {
  it('defaults to / when VITE_API_BASE is empty', () => {
    // In test config VITE_API_BASE is defined as '' so BASE should be '' (empty string - root relative)
    expect(BASE).toBe('');
  });
});

describe('dashSlug', () => {
  it('converts underscores to dashes', () => {
    expect(dashSlug('month_flows')).toBe('month-flows');
    expect(dashSlug('spending_trends')).toBe('spending-trends');
  });
  it('is idempotent for already dashed', () => {
    expect(dashSlug('month-flows')).toBe('month-flows');
  });
});
