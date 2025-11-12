import { chromium } from "@playwright/test";

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx = browser.contexts()[0];
  const pages = ctx.pages();

  // Find existing page or create new one
  let page = pages.find(p => p.url().includes('ledger-mind.org'));
  if (!page) {
    page = await ctx.newPage();
  }

  console.log(`📄 Initial URL: ${page.url()}`);

  const logs: string[] = [];
  const errors: string[] = [];

  // Attach console listener BEFORE navigation
  page.on('console', (msg) => {
    const text = msg.text();
    logs.push(`[${msg.type()}] ${text}`);
    if (msg.type() === 'error') {
      errors.push(text);
    }
  });

  // Navigate with cache bypass
  console.log('🔄 Navigating to chat...');
  await page.goto('https://app.ledger-mind.org/?chat=1&_=' + Date.now(), {
    waitUntil: 'networkidle',
    timeout: 30000
  });

  console.log('⏳ Waiting for chat to mount...');
  await page.waitForFunction(() => {
    const host = document.querySelector('lm-chatdock-host');
    return !!host && !!host.shadowRoot?.querySelector('#lm-chat-frame');
  }, { timeout: 15000 }).catch(() => console.log('⚠️  Chat did not mount'));

  await page.waitForTimeout(2000);

  console.log('\n=== ALL LOGS (last 30) ===');
  logs.slice(-30).forEach(l => console.log(l));

  console.log('\n=== RADIX SHIM LOGS ===');
  logs.filter(l => l.includes('radix-portal-shim')).forEach(l => console.log(l));

  console.log('\n=== PORTAL HOTFIX LOGS ===');
  logs.filter(l => l.includes('portal-hotfix')).forEach(l => console.log(l));

  console.log('\n=== REACT #185 ERRORS ===');
  const react185 = errors.filter(e => e.includes('185') || e.includes('isElement'));
  if (react185.length > 0) {
    console.log('❌ Found React #185 or isElement errors:');
    react185.forEach(e => console.log(e));
  } else {
    console.log('✅ No React #185 or isElement errors!');
  }

  await ctx.close();
  process.exit(0);
})();
