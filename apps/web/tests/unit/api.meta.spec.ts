import { describe, it, expect, vi, beforeEach } from 'vitest';
// Import shim wrapper that returns { month }
import { fetchLatestMonth } from '@/api/meta';

const okJSON = (data: Record<string, unknown>, init: Partial<ResponseInit> = {}) =>
  new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8', ...(init.headers || {}) },
    ...init,
  });

describe('api/meta.fetchLatestMonth', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('POSTs to /agent/tools/meta/latest_month and returns {month}', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async (input, init) => {
      expect(typeof input).toBe('string');
      expect(input).toBe('/agent/tools/meta/latest_month'); // No /api prefix per copilot-instructions
      expect(init?.method).toBe('POST');
      // body not semantically required, minimal '{}' is acceptable
      return okJSON({ month: '2025-08' });
    });

    const res = await fetchLatestMonth();
    expect(res).toEqual({ month: '2025-08' });
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
