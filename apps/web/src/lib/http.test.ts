import { describe, it, expect } from 'vitest';
import { NON_AUTH_BASE, dashSlug } from './http';

describe('NON_AUTH_BASE derivation', () => {
  it('strips trailing /api', () => {
    // In test config VITE_API_BASE is defined as '' so NON_AUTH_BASE should be '/'
    expect(NON_AUTH_BASE).toBe('/');
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
