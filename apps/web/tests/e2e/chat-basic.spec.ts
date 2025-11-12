/**
 * chat-basic.spec.ts - Basic /agent/chat API validation
 *
 * Tests core chat functionality at API level (no UI).
 */

import { test, expect } from '@playwright/test';
import { getAgentChatUrl } from './utils/api';

const BASE_URL = process.env.BASE_URL || 'https://app.ledger-mind.org';

test.describe('Chat API Basic @prod', () => {
  test.use({ storageState: 'tests/e2e/.auth/prod-state.json' });

  test('chat returns deterministic stub reply', async ({ request }) => {
    const r = await request.post(getAgentChatUrl(BASE_URL), {
      headers: { 'x-test-mode': 'stub' },
      data: {
        messages: [{ role: 'user', content: 'ping' }],
        context: { month: '2025-08' }
      },
    });

    expect(r.ok()).toBeTruthy();

    const j = await r.json();
    const text = j.reply ?? j.result?.text ?? j.text ?? '';

    // Should match deterministic stub response
    expect(text).toMatch(/deterministic test reply/i);
  });

  test('chat echo mode returns reflected content', async ({ request }) => {
    const r = await request.post(getAgentChatUrl(BASE_URL), {
      headers: { 'x-test-mode': 'echo' },
      data: {
        messages: [{ role: 'user', content: 'test message' }],
        context: { month: '2025-08' }
      },
    });

    expect(r.ok()).toBeTruthy();

    const j = await r.json();
    expect(j.reply).toMatch(/\[echo\] test message/);
  });

  test('chat handles mode parameter for tools', async ({ request }) => {
    const r = await request.post(getAgentChatUrl(BASE_URL), {
      data: {
        messages: [{ role: 'user', content: 'Show month summary' }],
        context: { month: '2025-08' },
        mode: 'charts.month_summary',
        force_llm: false
      },
    });

    expect(r.ok()).toBeTruthy();

    const j = await r.json();
    const text = j.reply ?? j.result?.text ?? j.text ?? '';

    // Tool responses should have content
    expect(text.length).toBeGreaterThan(0);
  });

  test('chat returns structured result for chart tools', async ({ request }) => {
    const r = await request.post(getAgentChatUrl(BASE_URL), {
      data: {
        messages: [{ role: 'user', content: 'kpis' }],
        context: { month: '2025-08' },
        mode: 'kpis',
        force_llm: false
      },
    });

    expect(r.ok()).toBeTruthy();

    const j = await r.json();

    // Should have either text or structured result
    const hasText = j.reply || j.text || j.result?.text;
    const hasStructured = j.result && typeof j.result === 'object';

    expect(hasText || hasStructured).toBeTruthy();
  });
});
