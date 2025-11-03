import { Page, test } from '@playwright/test';
import { apiBase } from './env';

export async function logDevEnv(page: Page, where: string) {
  try {
    const r = await page.request.get(`${apiBase()}/dev/env`);
    if (!r.ok()) {
      test.info().annotations.push({ type: 'env', description: `${where}: dev/env ${r.status()}` });
      return;
    }
    const j = await r.json();
    test.info().annotations.push({ type: 'env', description: `${where}: ${JSON.stringify(j)}` });
    // Also echo to console for CI logs
    // eslint-disable-next-line no-console
    console.log('[dev-env]', where, j);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    test.info().annotations.push({ type: 'env', description: `${where}: dev/env error ${msg}` });
  }
}
