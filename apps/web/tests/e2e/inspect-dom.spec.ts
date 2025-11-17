/**
 * DOM Inspector - Run once to discover actual ChatDock v2 structure
 *
 * Usage:
 *   pnpm exec playwright test inspect-dom.spec.ts --project=chromium-prod --headed
 */

import { test } from '@playwright/test';

test('Inspect ChatDock v2 DOM structure @prod', async ({ page }) => {
  await page.goto('https://app.ledger-mind.org?chat=1');

  // Wait for chat to open
  await page.waitForTimeout(2000);

  console.log('\n=== CHATDOCK V2 DOM INSPECTION ===\n');

  // Inspect launcher structure
  const launcherInfo = await page.evaluate(() => {
    const launcher = document.querySelector('[data-testid="lm-chat-launcher"]');
    const button = document.querySelector('[data-testid="lm-chat-launcher-button"]');
    const shell = document.querySelector('[data-testid="lm-chat-shell"]');
    const panel = document.querySelector('[data-testid="lm-chat-panel"]');

    return {
      launcher: {
        exists: !!launcher,
        state: launcher?.getAttribute('data-state'),
        classes: launcher?.className
      },
      button: {
        exists: !!button,
        visible: button ? getComputedStyle(button).display !== 'none' : false
      },
      shell: {
        exists: !!shell,
        classes: shell?.className,
        opacity: shell ? getComputedStyle(shell).opacity : null
      },
      panel: {
        exists: !!panel,
        classes: panel?.className
      }
    };
  });

  console.log('LAUNCHER STRUCTURE:');
  console.log(JSON.stringify(launcherInfo, null, 2));

  // Inspect chat content elements
  const contentInfo = await page.evaluate(() => {
    // Try various selectors for messages
    const messageSelectors = [
      '[data-testid="lm-chat-messages"]',
      '[data-testid="lm-chat-scroll"]',
      '.lm-chat-messages',
      '.lm-chat-log',
      '.lm-chat-gradient',
      '[class*="message"]',
      '[class*="scroll"]'
    ];

    const messagesFound = messageSelectors.map(sel => ({
      selector: sel,
      exists: !!document.querySelector(sel),
      element: document.querySelector(sel)?.tagName,
      classes: document.querySelector(sel)?.className
    }));

    // Try various selectors for input
    const inputSelectors = [
      '[data-testid="lm-chat-input"]',
      '[data-testid="chat-input"]',
      'textarea[placeholder*="Ask"]',
      'textarea[placeholder*="question"]',
      '.lm-chat-input',
      'textarea'
    ];

    const inputsFound = inputSelectors.map(sel => ({
      selector: sel,
      exists: !!document.querySelector(sel),
      element: document.querySelector(sel)?.tagName,
      placeholder: (document.querySelector(sel) as HTMLTextAreaElement)?.placeholder
    }));

    // Try various selectors for tools toggle
    const toolsSelectors = [
      '[data-testid="chat-tools-toggle"]',
      '[data-testid="lm-chat-tools-toggle"]',
      'button[aria-label*="tools"]',
      'button[aria-label*="Tools"]',
      '.tools-toggle',
      '[class*="tools"]'
    ];

    const toolsFound = toolsSelectors.map(sel => ({
      selector: sel,
      exists: !!document.querySelector(sel),
      element: document.querySelector(sel)?.tagName,
      text: document.querySelector(sel)?.textContent?.trim()
    }));

    // Look for LLM badge
    const badgeSelectors = [
      '.badge',
      '[class*="badge"]',
      '[class*="status"]',
      'span:has-text("LLM")',
      '*:has-text("LLM:")'
    ];

    const badgesFound = badgeSelectors.map(sel => {
      try {
        return {
          selector: sel,
          exists: !!document.querySelector(sel),
          element: document.querySelector(sel)?.tagName,
          text: document.querySelector(sel)?.textContent?.trim().substring(0, 50)
        };
      } catch {
        return { selector: sel, exists: false, error: 'Invalid selector' };
      }
    });

    return {
      messages: messagesFound.filter(m => m.exists),
      input: inputsFound.filter(i => i.exists),
      tools: toolsFound.filter(t => t.exists),
      badges: badgesFound.filter(b => b.exists)
    };
  });

  console.log('\nMESSAGES CONTAINER:');
  console.log(JSON.stringify(contentInfo.messages, null, 2));

  console.log('\nINPUT FIELD:');
  console.log(JSON.stringify(contentInfo.input, null, 2));

  console.log('\nTOOLS TOGGLE:');
  console.log(JSON.stringify(contentInfo.tools, null, 2));

  console.log('\nBADGES:');
  console.log(JSON.stringify(contentInfo.badges, null, 2));

  // Get full DOM snapshot of shell content
  const shellStructure = await page.evaluate(() => {
    const shell = document.querySelector('[data-testid="lm-chat-shell"]');
    if (!shell) return null;

    const getStructure = (el: Element, depth = 0): any => {
      if (depth > 3) return '...';

      const result: any = {
        tag: el.tagName.toLowerCase(),
        testid: el.getAttribute('data-testid'),
        classes: el.className,
        children: []
      };

      for (let i = 0; i < Math.min(el.children.length, 5); i++) {
        result.children.push(getStructure(el.children[i], depth + 1));
      }

      if (el.children.length > 5) {
        result.children.push(`... +${el.children.length - 5} more`);
      }

      return result;
    };

    return getStructure(shell);
  });

  console.log('\nSHELL DOM STRUCTURE:');
  console.log(JSON.stringify(shellStructure, null, 2));

  // Check for globals
  const globals = await page.evaluate(() => {
    return {
      lmChatInit: typeof (window as any).lmChatInit,
      lmChatReady: typeof (window as any).lmChatReady,
      __E2E_TEST__: typeof (window as any).__E2E_TEST__
    };
  });

  console.log('\nGLOBALS:');
  console.log(JSON.stringify(globals, null, 2));

  console.log('\n=== END INSPECTION ===\n');

  // Keep browser open for manual inspection
  await page.waitForTimeout(60000);
});
