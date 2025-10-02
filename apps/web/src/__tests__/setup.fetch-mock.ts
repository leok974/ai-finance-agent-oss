// Vitest types resolved via imports; legacy triple-slash removed.
// Mini fetch mock to prevent ECONNREFUSED noise in unit tests
import { vi, beforeAll, afterAll } from 'vitest';

const okJson = async () => ({ ok: true });

beforeAll(() => {
  // Only install a default fetch mock if user/tests haven't already provided one.
  // Generic minimal shape for our mocked fetch; arg/result types not important for tests.
  // Use unknown instead of any for lint compliance.
  type MockedFetch = ((...args: unknown[]) => Promise<unknown>) & { _isTestMock?: boolean };
  const g = globalThis as unknown as { fetch?: MockedFetch };
  if (!g.fetch || !g.fetch._isTestMock) {
    const defaultMock: MockedFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? 'application/json' : '') },
      json: okJson,
      text: async () => JSON.stringify(await okJson()),
    })) as MockedFetch;
    defaultMock._isTestMock = true;
    g.fetch = defaultMock;
  }

  // Optionally hush console errors/warns from network layers to reduce noise
  type SilencedFn = ((...args: unknown[]) => void) & { __silenced?: boolean };
  const cerr = console.error as unknown as SilencedFn;
  if (!cerr.__silenced) {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    cerr.__silenced = true;
  }
  const cwarn = console.warn as unknown as SilencedFn;
  if (!cwarn.__silenced) {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    cwarn.__silenced = true;
  }
});

afterAll(() => {
  vi.restoreAllMocks();
});
