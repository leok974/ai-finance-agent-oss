import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchJSON } from '@/lib/fetchJSON';

const okJSON = (data: unknown, init: Partial<ResponseInit> = {}) =>
  new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8', ...(init.headers || {}) },
    ...init,
  });

const okText = (text: string, init: Partial<ResponseInit> = {}) =>
  new Response(text, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8', ...(init.headers || {}) },
    ...init,
  });

const errJSON = (status: number, data: unknown, init: Partial<ResponseInit> = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', ...(init.headers || {}) },
    ...init,
  });

const errText = (status: number, text: string, init: Partial<ResponseInit> = {}) =>
  new Response(text, {
    status,
    headers: { 'content-type': 'text/plain', ...(init.headers || {}) },
    ...init,
  });

describe('fetchJSON', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns parsed JSON on 200 with application/json content-type', async () => {
    const body = { ok: true, n: 42 };
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(okJSON(body));

    const res = await fetchJSON<typeof body>('/api/example');
    expect(res).toEqual(body);
  });

  it('throws if 200 but content-type is not JSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(okText('<html>not json</html>'));

    await expect(fetchJSON('/api/html'))
      .rejects.toThrow(/Expected JSON/i);
  });

  it('throws with detail on HTTP error with JSON body', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    // Provide error responses for both invocations (two expectations call fetchJSON separately)
    fetchSpy.mockResolvedValueOnce(
      errJSON(400, { error: 'bad_request', message: 'Invalid input' })
    );
    fetchSpy.mockResolvedValueOnce(
      errJSON(400, { error: 'bad_request', message: 'Invalid input' })
    );

    await expect(fetchJSON('/api/bad'))
      .rejects.toThrow(/HTTP 400/i);
    await expect(fetchJSON('/api/bad'))
      .rejects.toThrow(/bad_request|Invalid input/i);
  });

  it('throws with detail on HTTP error with text body', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    fetchSpy.mockResolvedValueOnce(
      errText(500, 'Internal Server Error\nstack…')
    );
    fetchSpy.mockResolvedValueOnce(
      errText(500, 'Internal Server Error\nstack…')
    );

    await expect(fetchJSON('/api/fail'))
      .rejects.toThrow(/HTTP 500/i);
    await expect(fetchJSON('/api/fail'))
      .rejects.toThrow(/Internal Server Error/i);
  });

  it('throws when fetch rejects (network error)', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('getaddrinfo ENOTFOUND'));

    await expect(fetchJSON('/api/offline'))
      .rejects.toThrow(/ENOTFOUND|network/i);
  });

  it('throws if 200 with missing content-type header (not JSON)', async () => {
    const resp = new Response('okay', { status: 200 }); // no content-type
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(resp);

    await expect(fetchJSON('/api/unknown'))
      .rejects.toThrow(/Expected JSON/i);
  });
});
