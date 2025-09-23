import { describe, it, expect } from 'vitest';
import '../../state/auth';

describe('isolate auth import', () => {
  it('auth module imported', () => {
    expect(true).toBe(true);
  });
});
