#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const distDir = path.resolve('dist');
const indexHtmlPath = path.join(distDir, 'index.html');

// 1. Read index.html and collect all CSS hrefs
const html = fs.readFileSync(indexHtmlPath, 'utf8');
const cssHrefMatches = [...html.matchAll(/href="([^"]+\.css)"/g)];
const cssHrefs = cssHrefMatches.map((m) => m[1]);

if (cssHrefs.length === 0) {
  console.error('[verify-chat-css] No CSS <link> tags found in dist/index.html');
  process.exit(1);
}

console.log('[verify-chat-css] CSS files referenced in index.html:');
cssHrefs.forEach((href) => console.log('  -', href));

// 2. Load each referenced CSS file and check for ChatDock selectors
const requiredSelectors = [
  '.lm-chat-shell',
  '.lm-chat-launcher',
  '.lm-chat-launcher-bubble', // Current version uses this
];

let found = new Set();

for (const href of cssHrefs) {
  const cssPath = path.join(distDir, href.replace(/^\//, ''));
  if (!fs.existsSync(cssPath)) {
    console.error(
      `[verify-chat-css] CSS file referenced in index.html not found on disk: ${cssPath}`,
    );
    process.exit(1);
  }

  const css = fs.readFileSync(cssPath, 'utf8');

  for (const sel of requiredSelectors) {
    if (css.includes(sel)) {
      found.add(sel);
    }
  }
}

// 3. Fail build if any required selector is missing
const missing = requiredSelectors.filter((sel) => !found.has(sel));

if (missing.length > 0) {
  console.error('[verify-chat-css] ERROR: ChatDock selectors missing from referenced CSS files:');
  for (const sel of missing) {
    console.error('  -', sel);
  }
  console.error(
    '[verify-chat-css] This usually means chat/index.css was compiled into an orphaned chunk or its import was removed.',
  );
  process.exit(1);
}

console.log('[verify-chat-css] OK: ChatDock CSS is present in referenced CSS files.');
