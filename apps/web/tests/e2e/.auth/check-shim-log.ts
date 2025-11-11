import { chromium } from "@playwright/test";

(async () => {
  console.log('🔌 Connecting to remote Chrome...');

  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const contexts = browser.contexts();

  if (contexts.length === 0) {
    console.error('❌ No browser contexts found');
    process.exit(1);
  }

  const ctx = contexts[0];
  const pages = ctx.pages();

  if (pages.length === 0) {
    console.error('❌ No pages found');
    process.exit(1);
  }

  const page = pages[0];

  console.log(`📄 Attached to page: ${page.url()}`);

  const logs: string[] = [];
  const errors: string[] = [];

  page.on('console', (msg) => {
    const text = msg.text();
    logs.push(`[${msg.type()}] ${text}`);

    if (msg.type() === 'error') {
      errors.push(text);
    }
  });

  // Wait for iframe to load
  console.log('⏳ Waiting for chat iframe...');

  await page.waitForFunction(() => {
    const host = document.querySelector('lm-chatdock-host');
    return !!host && !!host.shadowRoot?.querySelector('#lm-chat-frame');
  }, { timeout: 30_000 }).catch(() => {
    console.log('⚠️  Chat iframe not found after 30s');
  });

  // Give time for logs to accumulate
  await page.waitForTimeout(3000);

  // Get iframe frame and attach console listener
  console.log('📦 Attaching to iframe frame...');
  const iframeHandle = await page.evaluateHandle(() => {
    const host = document.querySelector('lm-chatdock-host');
    return host?.shadowRoot?.querySelector('#lm-chat-frame');
  });

  const chatFrame = await iframeHandle.asElement()?.contentFrame();
  await iframeHandle.dispose();

  if (chatFrame) {
    const frameLogs: string[] = [];
    const frameErrors: string[] = [];

    chatFrame.on('console', (msg) => {
      const text = msg.text();
      frameLogs.push(`[${msg.type()}] ${text}`);

      if (msg.type() === 'error') {
        frameErrors.push(text);
      }
    });

    // Wait for iframe to initialize
    await chatFrame.waitForTimeout(2000);

    console.log('\n=== IFRAME CONSOLE LOGS ===');
    frameLogs.forEach(log => console.log(log));

    console.log('\n=== CHECKING FOR SHIM LOG IN IFRAME ===');
    const shimLogs = frameLogs.filter(l => l.includes('radix-portal-shim'));
    if (shimLogs.length > 0) {
      console.log('✅ SHIM LOG FOUND:');
      shimLogs.forEach(log => console.log('  ', log));
    } else {
      console.log('❌ NO SHIM LOG FOUND IN IFRAME');
    }

    console.log('\n=== CHECKING FOR REACT #185 IN IFRAME ===');
    const react185 = frameErrors.filter(e => e.includes('React') && e.includes('185'));
    if (react185.length > 0) {
      console.log('❌ REACT #185 FOUND:');
      react185.forEach(err => console.log('  ', err));
    } else {
      console.log('✅ NO REACT #185 ERRORS IN IFRAME');
    }
  }

  console.log('\n=== MAIN PAGE CONSOLE LOGS ===');
  logs.forEach(log => console.log(log));

  console.log('\n=== CHECKING FOR SHIM LOG ===');
  const shimLogs = logs.filter(l => l.includes('radix-portal-shim'));
  if (shimLogs.length > 0) {
    console.log('✅ SHIM LOG FOUND:');
    shimLogs.forEach(log => console.log('  ', log));
  } else {
    console.log('❌ NO SHIM LOG FOUND');
  }

  console.log('\n=== CHECKING FOR REACT #185 ===');
  const react185 = errors.filter(e => e.includes('React') && e.includes('185'));
  if (react185.length > 0) {
    console.log('❌ REACT #185 FOUND:');
    react185.forEach(err => console.log('  ', err));
  } else {
    console.log('✅ NO REACT #185 ERRORS');
  }

  console.log('\n=== IFRAME STATUS ===');
  const iframeExists = await page.evaluate(() => {
    const host = document.querySelector('lm-chatdock-host');
    return !!host && !!host.shadowRoot?.querySelector('#lm-chat-frame');
  });
  console.log(`Chat iframe exists: ${iframeExists}`);

  if (iframeExists) {
    const iframeSrc = await page.evaluate(() => {
      const host = document.querySelector('lm-chatdock-host');
      const frame = host?.shadowRoot?.querySelector('#lm-chat-frame') as HTMLIFrameElement;
      return frame?.src ?? null;
    });
    console.log(`Iframe src: ${iframeSrc}`);
  }

  await ctx.close();
  process.exit(0);
})();
