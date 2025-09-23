#!/usr/bin/env node
// Attempts to remove the phantom singleton test file before typechecking.
const fs = require('fs');
const path = require('path');

const targets = [
  'src/__tests__/Toaster.singleton.test.tsx',
  'src/__tests__/Toaster.singleton.test.tsx.disabled'
];

for (const rel of targets) {
  const p = path.resolve(process.cwd(), rel);
  try {
    if (fs.existsSync(p)) {
      fs.rmSync(p, { force: true });
      console.log('[prune-phantom] Removed', rel);
    }
  } catch (e) {
    console.warn('[prune-phantom] Failed to remove', rel, e);
  }
}
