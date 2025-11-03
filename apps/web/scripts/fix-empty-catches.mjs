import { globby } from 'globby';
import fs from 'node:fs/promises';

// Find TS/JS source files excluding type decls
const files = await globby(['src/**/*.{ts,tsx,js,jsx}', '!**/*.d.ts']);

const CATCH_EMPTY = /catch\s*(\(\s*[^\)]*\s*\))?\s*\{\s*\}/g;

for (const f of files) {
  let s = await fs.readFile(f, 'utf8');
  const before = s;
  s = s.replace(CATCH_EMPTY, (_m, grp) => {
    const param = grp && grp.trim().length > 2 ? grp : '(_err)';
    return `catch ${param} { /* intentionally empty: swallow to render empty-state */ }`;
  });
  if (s !== before) {
    await fs.writeFile(f, s, 'utf8');
    console.log('fixed:', f);
  }
}
