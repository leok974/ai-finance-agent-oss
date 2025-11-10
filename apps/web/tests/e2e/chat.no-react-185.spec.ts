import { test, expect } from '@playwright/test';

const APP = process.env.BASE_URL!;

test('no React #185 or ErrorBoundary on initial mount', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    const t = msg.text();
    if (/Minified React error #185|ErrorBoundary caught/i.test(t)) errors.push(t);
  });

  await page.goto(`${APP}/?chat=1`, { waitUntil: 'networkidle' });

  // Extra idle so portals/tooltip managers get a chance to boot
  await page.waitForTimeout(2000);

  expect(errors, errors.join('\n')).toHaveLength(0);
});
