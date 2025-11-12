/**
 * LLM-aware E2E tests for agent chat
 *
 * These tests require a real LLM backend and are skipped if:
 * - Backend status endpoint is unreachable
 * - Backend reports llm_ok: false
 *
 * Run with: pnpm exec playwright test chat-llm.spec.ts --workers=1
 */

import { test, expect } from '@playwright/test';
import { getHmacCredentials, sign } from './utils/hmac';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const PATH = process.env.AGENT_PATH || '/agent/chat';

test.describe('LLM Integration @requires-llm', () => {
  test.slow(); // Increase timeout budget for LLM responses
  test.describe.configure({ mode: 'serial' }); // Keep LLM load serialized

  test.beforeAll(async ({ request }) => {
    // Health gate: soft skip if LLM isn't ready
    try {
      const r = await request.get(`${BASE}/agent/status`);
      if (!r.ok()) {
        test.skip(true, 'Status endpoint unavailable');
        return;
      }

      const status = await r.json();
      if (!status.llm_ok) {
        test.skip(true, 'LLM not ready; skipping @requires-llm tests');
      }
    } catch (err) {
      test.skip(true, `Health check failed: ${err}`);
    }
  });

  test('chat returns real LLM reply @requires-llm', async ({ request }) => {
    const creds = getHmacCredentials();

    // Warmup: prime model & caches
    for (let i = 0; i < 2; i++) {
      const warmupPayload = {
        messages: [{ role: 'user', content: 'warmup' }],
        context: { month: '2025-08' },
        force_llm: true,
      };

      const { headers: warmupHeaders, body: warmupBody } = sign({
        method: 'POST',
        path: PATH,
        body: warmupPayload,
        creds,
      });

      await request.post(`${BASE}${PATH}`, {
        headers: warmupHeaders,
        data: warmupBody,
      });
    }

    // Real request: force_llm true, no test-mode header
    const payload = {
      messages: [{ role: 'user', content: 'In one short sentence, say hello.' }],
      context: { month: '2025-08' },
      force_llm: true,
    };

    const { headers, body } = sign({
      method: 'POST',
      path: PATH,
      body: payload,
      creds,
    });

    const r = await request.post(`${BASE}${PATH}`, {
      headers,
      data: body,
    });

    expect(r.ok()).toBeTruthy();
    const j = await r.json();

    // Robust extraction: handle various response shapes
    const txt = (j.reply ?? j.result?.text ?? j.text ?? '').toString().trim();

    // Shape assertions (not exact phrasing)
    expect(txt.length).toBeGreaterThan(8); // Non-trivial reply
    expect(/hello|hi|hey|greet/i.test(txt)).toBeTruthy(); // Human-ish greeting

    // Ensure it's NOT stub/echo mode
    expect(/^\[echo\]/i.test(txt)).toBeFalsy();
    expect(/deterministic test reply/i.test(txt)).toBeFalsy();
  });

  test('chat handles complex LLM query @requires-llm', async ({ request }) => {
    const creds = getHmacCredentials();

    const payload = {
      messages: [
        {
          role: 'user',
          content: 'What are the top 3 spending categories this month?',
        },
      ],
      context: { month: '2025-08' },
      force_llm: true,
    };

    const { headers, body } = sign({
      method: 'POST',
      path: PATH,
      body: payload,
      creds,
    });

    const r = await request.post(`${BASE}${PATH}`, {
      headers,
      data: body,
    });

    expect(r.ok()).toBeTruthy();
    const j = await r.json();

    const txt = (j.reply ?? j.result?.text ?? j.text ?? '').toString().trim();

    // Should have substantive content
    expect(txt.length).toBeGreaterThan(20);

    // Should mention categories or spending (loose check)
    expect(/categor|spend|top|month/i.test(txt)).toBeTruthy();

    // Should not be test mode
    expect(/^\[echo\]/i.test(txt)).toBeFalsy();
    expect(/deterministic/i.test(txt)).toBeFalsy();
  });

  test('chat with conversation history @requires-llm', async ({ request }) => {
    const creds = getHmacCredentials();

    const payload = {
      messages: [
        { role: 'user', content: 'My name is Alice.' },
        { role: 'assistant', content: 'Nice to meet you, Alice!' },
        { role: 'user', content: 'What is my name?' },
      ],
      context: { month: '2025-08' },
      force_llm: true,
    };

    const { headers, body } = sign({
      method: 'POST',
      path: PATH,
      body: payload,
      creds,
    });

    const r = await request.post(`${BASE}${PATH}`, {
      headers,
      data: body,
    });

    expect(r.ok()).toBeTruthy();
    const j = await r.json();

    const txt = (j.reply ?? j.result?.text ?? j.text ?? '').toString().trim();

    // Should reference the name (loose check for context retention)
    expect(txt.length).toBeGreaterThan(5);
    expect(/alice/i.test(txt)).toBeTruthy();
  });
});
