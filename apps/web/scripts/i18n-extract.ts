#!/usr/bin/env ts-node
// Simple i18n extraction / validation script.
// Scans source for t('...') calls and compares with English dictionary keys.
// Reports:
//  - missing: keys referenced in code but absent from en dictionary
//  - unused: keys present in dictionary but not referenced anywhere (excluding comments)
// Exits with non‑zero status if any missing keys are found.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve project root (apps/web)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.join(__dirname, '..');
const srcDir = path.join(root, 'src');

// Load dictionaries (TypeScript source) via naive parse: we import the built TS via ts-node execution context.
// To avoid ESM loader complexity, we do a lightweight regex extraction of the 'dictionaries' export.
const i18nFile = path.join(srcDir, 'lib', 'i18n.ts');
const i18nSource = fs.readFileSync(i18nFile, 'utf8');

// Roughly extract English dictionary object literal.
// We find 'en:' then match braces; for robustness a small stack parser.
function extractEnDict(src: string): any {
  const enIndex = src.indexOf("en:");
  if (enIndex === -1) throw new Error('Could not locate en: dictionary');
  const braceStart = src.indexOf('{', enIndex);
  if (braceStart === -1) throw new Error('No opening brace for en dictionary');
  let depth = 0; let end = braceStart;
  for (let i = braceStart; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  const objectLiteral = src.slice(braceStart, end + 1);
  // Convert to JSON-ish: remove trailing commas, wrap keys.
  // Instead of attempting a full transform, use eval in a sandbox.
  // eslint-disable-next-line no-new-func
  const enObj = Function(`"use strict"; return (${objectLiteral});`)();
  return enObj;
}

// Recursively flatten dictionary
function flatten(obj: any, prefix = ''): string[] {
  const keys: string[] = [];
  for (const k of Object.keys(obj)) {
    const value = obj[k];
    const full = prefix ? `${prefix}.${k}` : k;
    if (value && typeof value === 'object') keys.push(...flatten(value, full));
    else keys.push(full);
  }
  return keys;
}

const enDict = extractEnDict(i18nSource);
const enKeys = new Set(flatten(enDict));

// Gather all TSX/TS source files
function walk(dir: string): string[] {
  return fs.readdirSync(dir).flatMap(entry => {
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) return walk(full);
    if (/\.(tsx?|jsx?)$/.test(entry)) return [full];
    return [];
  });
}

const files = walk(srcDir);
const usedKeys = new Set<string>();
const tCallRegex = /\bt\(\s*['"]([a-zA-Z0-9_.-]+)['"]/g;

for (const f of files) {
  const raw = fs.readFileSync(f, 'utf8');
  // Strip block comments and line comments (naive but sufficient for guard comments)
  const withoutComments = raw
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  let m: RegExpExecArray | null;
  while ((m = tCallRegex.exec(withoutComments))) {
    usedKeys.add(m[1]);
  }
}

const missing = Array.from(usedKeys).filter(k => !enKeys.has(k)).sort();
const unused = Array.from(enKeys).filter(k => !usedKeys.has(k)).sort();

const report = {
  counts: { en: enKeys.size, used: usedKeys.size, missing: missing.length, unused: unused.length },
  missing,
  // unused - comment out to reduce noise if not needed for cleanup
};

// Only log if there are issues or if verbose mode is enabled
if (missing.length || process.env.I18N_VERBOSE === '1') {
  console.log(JSON.stringify(report, null, 2));
}

if (missing.length) {
  console.error(`\nERROR: ${missing.length} missing i18n keys.`);
  process.exit(1);
} else if (process.env.I18N_VERBOSE !== '1') {
  console.log(`✓ i18n check passed (${usedKeys.size} keys used, ${unused.length} unused)`);
}
