import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchAuth } from './http';

const restore = () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
};

describe('fetchAuth joins /api/auth/*', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as any);
  });

  afterEach(restore);

  it('calls /api/auth/login with expected init', async () => {
    const body = { email: 'a@b', password: 'x' };
    await fetchAuth('/auth/login', { method: 'POST', body: JSON.stringify(body) });
    const calls = (global.fetch as any).mock.calls;
    expect(calls.length).toBe(1);
    const [url, init] = calls[0];
    expect(String(url)).toBe('/api/auth/login');
    expect(init.credentials).toBe('same-origin');
    expect(init.cache).toBe('no-store');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify(body));
  });
});
