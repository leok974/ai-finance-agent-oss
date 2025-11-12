import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCategorizeRule } from '@/api/rules';

// We'll mock global fetch to simulate the sequence of attempts.

// Provide a minimal typing for global in this test context
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const global: { fetch: any };

const okJson = (data: unknown) => Promise.resolve({ ok: true, json: () => Promise.resolve(data) });
const fail = (status: number, body: unknown = {}) => Promise.resolve({ ok: false, status, json: () => Promise.resolve(body), text: () => Promise.resolve(JSON.stringify(body)) });

interface CallHit { url: string; body: unknown }
let calls: CallHit[] = [];

beforeEach(() => {
  calls = [];
  global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url: String(url), body });
    // shape 1 attempt - matches /agent/tools/rules/save (no /api prefix per copilot-instructions)
    if (url === '/agent/tools/rules/save') {
      // Fail first shape to force fallback (#1)
      if (JSON.stringify(body).includes('"kind":"categorize"')) {
        return fail(400, { error: 'unsupported shape' });
      }
      // Accept verbose second shape
      if (JSON.stringify(body).includes('"action":"set_category"')) {
        return okJson({ id: 202, ok: true }); // Return 202 to match actual behavior
      }
    }
    if (url === '/api/rules/save') {
      return okJson({ rule_id: 555, ok: true });
    }
    return fail(404, { error: 'not found' });
  });
});

describe('createCategorizeRule', () => {
  it('succeeds on second attempt (verbose shape) without hitting legacy', async () => {
    const res = await createCategorizeRule({ merchant: 'COFFEE CO', category: 'Food & Drink' });
    expect(res.ok).toBe(true);
    expect(res.id).toBe(202); // Updated to match mock response
    // First two calls: first shape fail, second shape success, no legacy
    expect(calls.map(c => c.url)).toEqual([
      '/agent/tools/rules/save', // No /api prefix per copilot-instructions
      '/agent/tools/rules/save',
    ]);
  });

  it('falls back to legacy when both new shapes fail', async () => {
    // Override fetch to force both new shapes failing
  global.fetch.mockImplementation(async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ url: String(url), body });
      if (url.includes('agent/tools/rules/save')) {
        return fail(400, { error: 'unsupported shape' });
      }
      if (url === '/api/rules/save') return okJson({ rule_id: 555, ok: true });
      return fail(404, {});
    });

    const res = await createCategorizeRule({ merchant: 'BOOKS INC', category: 'Books' });
    expect(res.ok).toBe(true);
    expect(res.id).toBe(555);
    expect(calls.map(c => c.url)).toEqual([
      '/agent/tools/rules/save', // first attempt (categorize) - no /api prefix
      '/agent/tools/rules/save', // second attempt (verbose) - no /api prefix
      '/api/rules/save',         // legacy fallback - keeps /api per instructions
    ]);
  });
});
