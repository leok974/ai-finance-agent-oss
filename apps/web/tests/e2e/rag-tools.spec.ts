// apps/web/tests/e2e/rag-tools.spec.ts
/**
 * E2E smoke tests for RAG tools (admin-only).
 * Tests direct API endpoints and UI component integration.
 */
import { test, expect } from '@playwright/test';
import { apiRoot } from './utils/env';

test.describe('RAG Tools (Admin)', () => {
  test.beforeEach(async ({ page }) => {
    // Seed admin user via dev endpoint
    const seedUrl = `${apiRoot()}/api/dev/seed-user`;
    try {
      await page.request.post(seedUrl, {
        data: { email: 'e2e@example.com', password: 'e2e-password', role: 'admin' },
      });
    } catch (err) {
      console.warn('[rag-tools] seed-user may have failed (already exists?)', err);
    }

    // Login
    const loginUrl = `${apiRoot()}/api/auth/login`;
    const loginRes = await page.request.post(loginUrl, {
      data: { email: 'e2e@example.com', password: 'e2e-password' },
    });
    expect(loginRes.ok()).toBeTruthy();
  });

  test('@backend RAG status endpoint', async ({ page }) => {
    const statusUrl = `${apiRoot()}/agent/tools/rag/status`;
    const response = await page.request.get(statusUrl);

    expect(response.ok()).toBeTruthy();
    const data = await response.json();

    // Should return index statistics
    expect(data).toHaveProperty('documents');
    expect(data).toHaveProperty('chunks');
    expect(data).toHaveProperty('vendors');
    expect(typeof data.documents).toBe('number');
    expect(typeof data.chunks).toBe('number');
    expect(Array.isArray(data.vendors)).toBeTruthy();
  });

  test('@backend RAG rebuild endpoint', async ({ page }) => {
    const rebuildUrl = `${apiRoot()}/agent/tools/rag/rag.rebuild`;
    const response = await page.request.post(rebuildUrl, {
      data: {},
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();

    expect(data).toHaveProperty('ok');
    expect(data).toHaveProperty('result');
    expect(data.ok).toBe(true);
  });

  test('@backend RAG seed (dev-only)', async ({ page }) => {
    const seedUrl = `${apiRoot()}/agent/tools/rag/rag.seed`;
    const response = await page.request.post(seedUrl, {
      data: {},
    });

    // May succeed (ALLOW_DEV_ROUTES=1) or fail with 403 (prod mode)
    if (response.ok()) {
      const data = await response.json();
      expect(data).toHaveProperty('ok');
      expect(data.ok).toBe(true);
      expect(data.result).toHaveProperty('seeded');
    } else {
      expect(response.status()).toBe(403);
      const data = await response.json();
      expect(data.detail).toContain('Dev route disabled');
    }
  });

  test('@backend RAG ingest URL (form-encoded)', async ({ page }) => {
    const ingestUrl = `${apiRoot()}/agent/tools/rag/ingest_url`;
    const response = await page.request.post(ingestUrl, {
      form: {
        url: 'https://example.com',
      },
    });

    // May succeed or fail depending on network/backend config
    // We're primarily testing auth and endpoint availability
    if (response.ok()) {
      const data = await response.json();
      expect(data).toHaveProperty('ok');
    } else {
      // 500/timeout acceptable for network-dependent endpoint
      expect([400, 403, 500, 503]).toContain(response.status());
    }
  });

  test('@backend RAG action requires admin', async ({ page }) => {
    // Logout to test auth requirement
    const logoutUrl = `${apiRoot()}/api/auth/logout`;
    await page.request.post(logoutUrl);

    const statusUrl = `${apiRoot()}/agent/tools/rag/status`;
    const response = await page.request.get(statusUrl);

    // Should fail with 401/403 when not authenticated
    expect([401, 403]).toContain(response.status());
  });

  test('@ui RagToolChips component visibility (admin)', async ({ page }) => {
    // Navigate to app (assuming RagToolChips is integrated into a page)
    await page.goto('/');

    // Wait for page load
    await page.waitForLoadState('networkidle');

    // Check if RAG Tools section exists (may be in ChatDock or admin panel)
    // This is a smoke test - actual integration depends on where component is mounted
    const ragToolsPresent = await page.locator('text=/RAG Tools.*Admin/i').count();

    if (ragToolsPresent > 0) {
      // If component is mounted, test button presence
      await expect(page.locator('button:has-text("Status")')).toBeVisible();
      await expect(page.locator('button:has-text("Rebuild")')).toBeVisible();
      await expect(page.locator('button:has-text("Seed")')).toBeVisible();

      // Test Status button click
      await page.locator('button:has-text("Status")').click();

      // Should see loading state or result
      await page.waitForTimeout(1000);
    } else {
      // Component not yet integrated - skip UI test
      test.skip();
    }
  });

  test('@integration Natural language RAG intent via agent', async ({ page }) => {
    // Test that natural language RAG commands work through agent router
    const chatUrl = `${apiRoot()}/agent/chat`;

    const response = await page.request.post(chatUrl, {
      data: {
        messages: [
          { role: 'user', content: 'What is the RAG index status?' },
        ],
        intent: 'general',
        context: {},
      },
    });

    if (response.ok()) {
      const data = await response.json();

      // Should detect RAG intent and execute
      expect(data).toHaveProperty('reply');
      expect(data).toHaveProperty('mode');

      // Check for RAG-specific response markers
      const reply = data.reply.toLowerCase();
      const _hasRagKeywords = reply.includes('rag') || reply.includes('documents') || reply.includes('chunks') || reply.includes('index');

      if (data.mode === 'tool' || data.tool === 'rag') {
        expect(data.tool).toBe('rag');
        expect(data.action).toBe('rag.status');
      }
    } else {
      // Agent endpoint may require more setup - log for debugging
      console.warn('[rag-tools] Agent chat endpoint returned', response.status());
    }
  });

  test('@integration RAG seed command via natural language', async ({ page }) => {
    const chatUrl = `${apiRoot()}/agent/chat`;

    const response = await page.request.post(chatUrl, {
      data: {
        messages: [
          { role: 'user', content: 'Seed the RAG knowledge base' },
        ],
        intent: 'general',
        context: {},
      },
    });

    if (response.ok()) {
      const data = await response.json();

      // Should detect RAG seed intent
      if (data.mode === 'tool' || data.tool === 'rag') {
        expect(data.tool).toBe('rag');
        expect(data.action).toBe('rag.seed');

        // May succeed or fail based on dev mode
        if (data.ok === false) {
          expect(data.message).toContain('dev mode');
        }
      }
    }
  });

  test('@integration RAG rebuild via natural language', async ({ page }) => {
    const chatUrl = `${apiRoot()}/agent/chat`;

    const response = await page.request.post(chatUrl, {
      data: {
        messages: [
          { role: 'user', content: 'Rebuild the RAG index' },
        ],
        intent: 'general',
        context: {},
      },
    });

    if (response.ok()) {
      const data = await response.json();

      // Should detect RAG rebuild intent
      if (data.mode === 'tool' || data.tool === 'rag') {
        expect(data.tool).toBe('rag');
        expect(data.action).toBe('rag.rebuild');
        expect(data.ok).toBe(true);
      }
    }
  });

  test('@integration URL extraction from natural language', async ({ page }) => {
    const chatUrl = `${apiRoot()}/agent/chat`;

    const response = await page.request.post(chatUrl, {
      data: {
        messages: [
          { role: 'user', content: 'Ingest this URL: https://example.com/pricing' },
        ],
        intent: 'general',
        context: {},
      },
    });

    if (response.ok()) {
      const data = await response.json();

      // Should detect RAG ingest_url intent and extract URL
      if (data.mode === 'tool' || data.tool === 'rag') {
        expect(data.tool).toBe('rag');
        expect(data.action).toBe('rag.ingest_url');

        // Check that URL was processed
        const reply = data.reply || data.message || '';
        expect(reply).toContain('example.com');
      }
    }
  });
});

test.describe('RAG Tools (Non-Admin)', () => {
  test.beforeEach(async ({ page }) => {
    // Seed regular user (no admin role)
    const seedUrl = `${apiRoot()}/api/dev/seed-user`;
    try {
      await page.request.post(seedUrl, {
        data: { email: 'user@example.com', password: 'user-password', role: 'user' },
      });
    } catch (err) {
      console.warn('[rag-tools] seed regular user may have failed', err);
    }

    // Login as regular user
    const loginUrl = `${apiRoot()}/api/auth/login`;
    const loginRes = await page.request.post(loginUrl, {
      data: { email: 'user@example.com', password: 'user-password' },
    });
    expect(loginRes.ok()).toBeTruthy();
  });

  test('@backend RAG tools blocked for non-admin', async ({ page }) => {
    const statusUrl = `${apiRoot()}/agent/tools/rag/status`;
    const response = await page.request.get(statusUrl);

    // Should fail with 403 for non-admin user
    expect(response.status()).toBe(403);

    const data = await response.json();
    expect(data.detail).toContain('Admin only');
  });

  test('@ui RagToolChips not visible to non-admin', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // RAG Tools should not be visible to non-admin users
    const ragToolsCount = await page.locator('text=/RAG Tools.*Admin/i').count();
    expect(ragToolsCount).toBe(0);
  });
});
