/**
 * chat-basic.spec.ts - Basic /agent/chat API validation
 *
 * Tests core chat functionality at API level (no UI).
 * Uses HMAC authentication for production endpoints.
 */

import { test, expect } from '@playwright/test';
import { getAgentChatUrl, AGENT_CHAT_PATH } from './utils/api';
import { sign, getHmacCredentials } from './utils/hmac';

const BASE_URL = process.env.BASE_URL || 'https://app.ledger-mind.org';

test.describe('Chat API Basic @prod', () => {
  // AUTH REMINDER (Copilot):
  // Use HMAC auth for /agent/* calls.
  // 1) Build canonical: "<METHOD>\n<PATH>\n<TIMESTAMP>\n<SHA256(body)>"
  // 2) X-Client-Id = HMAC_CLIENT_ID
  // 3) X-Timestamp = Date.now().toString()
  // 4) X-Signature = HMAC-SHA256(HMAC_SECRET, canonical) as hex
  // Use PATH from AGENT_PATH (/agent/chat or /api/agent/chat via nginx).
  // In E2E, add 'x-test-mode: stub' header for deterministic replies.

  test('chat returns deterministic stub reply @prod-critical', async ({ request }) => {
    const creds = getHmacCredentials();
    const payload = {
      messages: [{ role: 'user', content: 'ping' }],
      context: { month: '2025-08' }
    };

    const { headers, body } = sign({
      method: 'POST',
      path: AGENT_CHAT_PATH,
      body: payload,
      creds,
    });

    const r = await request.post(getAgentChatUrl(BASE_URL), {
      headers: { ...headers, 'x-test-mode': 'stub' },
      data: JSON.parse(body),
    });

    expect(r.ok()).toBeTruthy();

    const j = await r.json();
    const text = j.reply ?? j.result?.text ?? j.text ?? '';

    // Should match deterministic stub response
    expect(text).toMatch(/deterministic test reply/i);
  });

  test('chat echo mode returns reflected content @prod-critical', async ({ request }) => {
    const creds = getHmacCredentials();
    const payload = {
      messages: [{ role: 'user', content: 'test message' }],
      context: { month: '2025-08' }
    };

    const { headers, body } = sign({
      method: 'POST',
      path: AGENT_CHAT_PATH,
      body: payload,
      creds,
    });

    const r = await request.post(getAgentChatUrl(BASE_URL), {
      headers: { ...headers, 'x-test-mode': 'echo' },
      data: JSON.parse(body),
    });

    expect(r.ok()).toBeTruthy();

    const j = await r.json();
    expect(j.reply).toMatch(/\[echo\] test message/);
  });

  test('chat handles mode parameter for tools', async ({ request }) => {
    const creds = getHmacCredentials();
    const payload = {
      messages: [{ role: 'user', content: 'Show month summary' }],
      context: { month: '2025-08' },
      mode: 'charts.month_summary',
      force_llm: false
    };

    const { headers, body } = sign({
      method: 'POST',
      path: AGENT_CHAT_PATH,
      body: payload,
      creds,
    });

    const r = await request.post(getAgentChatUrl(BASE_URL), {
      headers,
      data: JSON.parse(body),
    });

    expect(r.ok()).toBeTruthy();

    const j = await r.json();
    const text = j.reply ?? j.result?.text ?? j.text ?? '';

    // Tool responses should have content
    expect(text.length).toBeGreaterThan(0);
  });

  // NOTE: LLM-dependent tests moved to chat-llm.spec.ts
  // Run with: pnpm exec playwright test chat-llm.spec.ts --workers=1
});
