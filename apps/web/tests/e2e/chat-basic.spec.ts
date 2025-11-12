/**
 * chat-basic.spec.ts - Basic /agent/chat API validation
 *
 * Tests core chat functionality at API level (no UI).
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'https://app.ledger-mind.org';

test.describe('Chat API Basic @prod', () => {
  test.use({ storageState: 'tests/e2e/.auth/prod-state.json' });

  test('chat returns human-readable reply', async ({ request }) => {
    const r = await request.post(`${BASE_URL}/api/agent/chat`, {
      data: {
        messages: [{ role: 'user', content: 'ping' }],
        context: { month: '2025-08' }
      },
    });

    expect(r.ok()).toBeTruthy();

    const j = await r.json();
    const text = j.reply ?? j.result?.text ?? j.text ?? '';

    // Should have actual text (not empty)
    expect(text.length).toBeGreaterThan(0);

    // Should be human-readable (match common response patterns)
    expect(text).toMatch(/ping|hello|ok|hi|pong|ready/i);
  });

  test('chat handles mode parameter for tools', async ({ request }) => {
    const r = await request.post(`${BASE_URL}/api/agent/chat`, {
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
    const r = await request.post(`${BASE_URL}/api/agent/chat`, {
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
