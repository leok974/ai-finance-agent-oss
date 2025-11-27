#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const SRC_DIR = path.resolve(process.cwd(), 'apps/web/src');
const I18N_FILE = path.resolve(process.cwd(), 'apps/web/src/lib/i18n.ts');

const T_REGEX = /\bt\(\s*['"`]([^'"`]+)['"`]/g; // simplistic t("key") matcher

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir)) {
    const p = path.join(dir, entry);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out); else if (/\.(tsx?|jsx?)$/.test(entry)) out.push(p);
  }
  return out;
}

function getDictKeys(): Set<string> {
  const src = fs.readFileSync(I18N_FILE, 'utf8');
  // Roughly grab the en: { ... } block
  const m = src.match(/en:\s*({[\s\S]*?})\s*}\s*as const/);
  if (!m) return new Set();
  // Convert to JSON-ish by quoting keys
  const jsonish = m[1]
    .replace(/(\w+)\s*:/g, '"$1":')
    .replace(/'([^']*)'/g, '"$1"')
    .replace(/,\s*}/g, '}')
    .replace(/,\s*]/g, ']');
  let obj: any;
  try { obj = JSON.parse(jsonish); } catch { return new Set(); }
  const keys = new Set<string>();
  const dfs = (o: any, pathParts: string[] = []) => {
    for (const k of Object.keys(o)) {
      const v = o[k];
      const np = [...pathParts, k];
      if (typeof v === 'string') {
        keys.add(np.join('.'));
      } else if (v && typeof v === 'object') {
        dfs(v, np);
      }
    }
  };
  dfs(obj);
  return keys;
}

const dictKeys = getDictKeys();
const usedKeys = new Set<string>();
for (const f of walk(SRC_DIR)) {
  const content = fs.readFileSync(f, 'utf8');
  let m: RegExpExecArray | null;
  while ((m = T_REGEX.exec(content))) {
    usedKeys.add(m[1]);
  }
}

const missing = [...usedKeys].filter(k => !dictKeys.has(k));
const unused = [...dictKeys].filter(k => !usedKeys.has(k));

console.log(JSON.stringify({ missing, unused }, null, 2));
