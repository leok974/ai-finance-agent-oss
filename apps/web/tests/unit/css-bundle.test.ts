/**
 * css-bundle.test.ts
 *
 * Bundle-level CSS verification tests.
 * These tests run against the built dist/ output to ensure critical CSS rules
 * are present and correct, independent of deployment/caching issues.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

describe('CSS Bundle Verification', () => {
  const distAssetsPath = join(__dirname, '../../dist/assets');

  it('chatSession bundle contains html,body overflow rule', () => {
    // Find the chatSession CSS file (hash changes on each build)
    const files = readdirSync(distAssetsPath);
    const chatSessionCss = files.find(f => f.startsWith('chatSession-') && f.endsWith('.css'));

    expect(chatSessionCss, 'chatSession-*.css bundle should exist in dist/assets').toBeDefined();

    const cssContent = readFileSync(join(distAssetsPath, chatSessionCss!), 'utf-8');

    // Verify the critical overflow rule exists
    // The minified rule should be: html,body{overflow:hidden auto!important}
    const hasOverflowRule = /html,body\{[^}]*overflow:hidden auto!important/.test(cssContent);

    expect(
      hasOverflowRule,
      `chatSession CSS should contain "html,body{overflow:hidden auto!important}" rule.\nChecked file: ${chatSessionCss}`
    ).toBe(true);
  });

  it('chatSession bundle does NOT contain conflicting overflow-y rule on html,body', () => {
    const files = readdirSync(distAssetsPath);
    const chatSessionCss = files.find(f => f.startsWith('chatSession-') && f.endsWith('.css'));

    expect(chatSessionCss).toBeDefined();

    const cssContent = readFileSync(join(distAssetsPath, chatSessionCss!), 'utf-8');

    // Check that there's no SEPARATE html,body{overflow-y:...} rule that would override
    // our shorthand. The shorthand should be the only html,body overflow rule.
    const allHtmlBodyOverflowRules = cssContent.match(/html,body\{[^}]*overflow[^}]*\}/g) || [];

    // Should have exactly ONE rule
    expect(
      allHtmlBodyOverflowRules.length,
      `Should have exactly one html,body overflow rule, found: ${allHtmlBodyOverflowRules.join(' | ')}`
    ).toBe(1);

    // And that one rule should be our shorthand
    expect(allHtmlBodyOverflowRules[0]).toMatch(/overflow:hidden auto!important/);
  });

  it('chat bundle exists (for iframe/legacy chat)', () => {
    const files = readdirSync(distAssetsPath);
    const chatCss = files.find(f => f.startsWith('chat-') && f.endsWith('.css'));

    expect(chatCss, 'chat-*.css bundle should exist for iframe chat').toBeDefined();
  });
});
