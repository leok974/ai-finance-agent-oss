import { request, expect } from '@playwright/test';

export async function waitForApp(baseURL: string, timeoutMs = 30000) {
  const api = await request.newContext();
  const start = Date.now();
  let lastErr = '';
  while (Date.now() - start < timeoutMs) {
    const r = await api.get(`${baseURL}/ready`);
    if (r.ok()) return;
    lastErr = `${r.status()} ${await r.text()}`;
    await new Promise(res => setTimeout(res, 1000));
  }
  expect(false, `Backend not ready: ${lastErr}`).toBeTruthy();
}
