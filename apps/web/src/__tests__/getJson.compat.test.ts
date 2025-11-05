import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { getJson } from '../api/getJson';

const server = setupServer(
  // 200 endpoint
  http.get('/api/legacy-ok', () => {
    return HttpResponse.json({ value: 42 }, { status: 200 });
  }),
  // 404 endpoint
  http.get('/api/legacy-missing', () => {
    return new HttpResponse(null, { status: 404 });
  })
);

// Stand up MSW
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('getJson compat behavior', () => {
  it('returns JSON for 200', async () => {
    const data = await getJson<{ value: number }>('/api/legacy-ok');
    expect(data).toEqual({ value: 42 });
  });

  it('gracefully returns empty object for 404', async () => {
    const data = await getJson<{ anything?: string }>('/api/legacy-missing');
    expect(data).toEqual({});
  });
});
