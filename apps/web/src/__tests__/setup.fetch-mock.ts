/// <reference types="vitest" />
// Mini fetch mock to prevent ECONNREFUSED noise in unit tests
import { vi, beforeAll, afterAll } from 'vitest';

const okJson = async () => ({ ok: true });

beforeAll(() => {
  // Basic stub; tweak per test if you need different responses
  (globalThis as any).fetch = vi.fn(async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? 'application/json' : '') },
    json: okJson,
    text: async () => JSON.stringify(await okJson()),
  })) as any;

  // Optionally hush console errors/warns from network layers
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterAll(() => {
  vi.restoreAllMocks();
});
