// apps/web/tests/utils/auth.ts
import { request, expect } from '@playwright/test';

/**
 * Verify that the saved auth state is still valid.
 * Use in beforeAll to fail fast if state is stale.
 */
export async function expectLoggedIn(baseURL: string, storageStatePath: string) {
  const ctx = await request.newContext({ baseURL, storageState: storageStatePath });
  const res = await ctx.get('/api/auth/me', { failOnStatusCode: false });
  await ctx.dispose();
  
  expect(res.status(), 'auth state invalid — rerun global setup or refresh credentials').toBe(200);
}
