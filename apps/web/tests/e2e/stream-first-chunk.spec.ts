import { test, expect } from '@playwright/test';
import { isEdgeLike } from './utils/env';

const DEFAULT_QUERY = process.env.AGENT_STREAM_QUERY ?? 'Need a quick KPI recap for this month.';
const STREAM_TIMEOUT_MS = Number(process.env.AGENT_STREAM_TIMEOUT_MS ?? '10000');
const BUDGET_MS = Number(process.env.AGENT_FIRST_CHUNK_BUDGET_MS ?? '1500');

interface WarmupProbeResult {
  ok: boolean;
  firstChunkMs: number | null;
  eventType: string | null;
  fallback: string | null;
  rawFirstChunk: string | null;
  error: string | null;
}

test.describe.configure({ mode: 'serial' });

test.describe('Agent streaming first chunk', () => {
  test.beforeAll(async () => {
    test.skip(!isEdgeLike(), 'Streaming spec is edge-only; skipped in dev E2E.');
  });
  test('first chunk latency stays within budget', async ({ page }, testInfo) => {
    test.slow();
    await page.goto('/');

    const streamUrl = new URL('/agui/chat', testInfo.project.use?.baseURL ?? process.env.PW_BASE_URL ?? 'http://localhost:5173');
    streamUrl.searchParams.set('q', DEFAULT_QUERY);

    const measurement = await page.evaluate<WarmupProbeResult, { url: string; timeoutMs: number }>(
      async ({ url, timeoutMs }) => {
        const allowedTypes = ['TEXT_MESSAGE_CONTENT', 'SUGGESTIONS'];
        const start = performance.now();
        let done = false;
        let firstChunkMs: number | null = null;
        let fallback: string | null = null;
        let eventType: string | null = null;
        let rawFirstChunk: string | null = null;
        let error: string | null = null;

        return await new Promise<WarmupProbeResult>((resolve) => {
          const timer = setTimeout(() => {
            if (done) {
              return;
            }
            done = true;
            resolve({ ok: false, firstChunkMs: null, eventType, fallback, rawFirstChunk, error: 'timeout' });
          }, timeoutMs);

          const es = new EventSource(url, { withCredentials: true });

          const finalize = (ok: boolean) => {
            if (done) {
              return;
            }
            done = true;
            clearTimeout(timer);
            try {
              es.close();
            } catch (closeErr) {
              console.warn('warmup-stream close failed', closeErr);
            }
            resolve({ ok, firstChunkMs, eventType, fallback, rawFirstChunk, error });
          };

          const handle = (label: string, data: string | null) => {
            if (done || !data) {
              return;
            }
            rawFirstChunk = rawFirstChunk ?? data;
            try {
              const parsed = JSON.parse(data);
              const type = parsed?.type ?? label;
              if (type === 'META') {
                if (parsed?.data?.fallback) {
                  fallback = parsed.data.fallback;
                }
                return;
              }
              if (type && !allowedTypes.includes(type)) {
                return;
              }
              eventType = type ?? label;
            } catch (parseErr) {
              eventType = label;
            }
            firstChunkMs = Math.round(performance.now() - start);
            finalize(true);
          };

          es.addEventListener('TEXT_MESSAGE_CONTENT', (evt) => handle(evt.type, evt.data));
          es.addEventListener('SUGGESTIONS', (evt) => handle(evt.type, evt.data));
          es.addEventListener('SUGGESTIONS_AVAILABLE', (evt) => handle(evt.type, evt.data));
          es.onmessage = (evt) => handle(evt.type || 'message', evt.data);
          es.onerror = () => {
            error = 'sse-error';
            finalize(false);
          };
        });
      },
      { url: streamUrl.toString(), timeoutMs: STREAM_TIMEOUT_MS }
    );

    const annotation = `firstChunkMs=${measurement.firstChunkMs ?? 'null'} budgetMs=${BUDGET_MS} eventType=${measurement.eventType ?? 'unknown'} fallback=${measurement.fallback ?? 'none'}`;
    testInfo.annotations.push({ type: 'first-chunk', description: annotation });

    const payload = JSON.stringify(measurement, null, 2);
    await testInfo.attach('first-chunk.json', {
      contentType: 'application/json',
      body: Buffer.from(payload, 'utf-8')
    });

    expect.soft(measurement.ok, measurement.error ?? 'expected stream chunk').toBeTruthy();
    expect(measurement.firstChunkMs, `first chunk exceeded budget (${measurement.firstChunkMs ?? 'null'}ms > ${BUDGET_MS}ms)`).toBeLessThanOrEqual(BUDGET_MS);
  });
});
