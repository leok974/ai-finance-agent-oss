import { test, expect } from '@playwright/test';

const APP = process.env.BASE_URL!;

test('no React #185 or ErrorBoundary on initial mount', async ({ page }) => {
  const errors: string[] = [];
  const allLogs: string[] = [];
  page.on('console', (msg) => {
    const t = msg.text();
    allLogs.push(t);
    if (/Minified React error #185|ErrorBoundary caught/i.test(t)) errors.push(t);
  });

  await page.goto(`${APP}/?chat=1`, { waitUntil: 'networkidle' });

  // Extra idle so portals/tooltip managers get a chance to boot
  await page.waitForTimeout(2000);

  // Show first 30 log lines for debugging
  console.log('=== FIRST 30 CONSOLE LOGS ===');
  console.log(allLogs.slice(0, 30).join('\n'));

  expect(errors, errors.join('\n')).toHaveLength(0);
});
