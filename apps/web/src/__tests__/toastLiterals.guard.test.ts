import { readFileSync, readdirSync } from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';

// Guard: ensure emitToastSuccess/Error calls use i18n (heuristic — looks for t('...') usage)
// Allows dynamic variables but disallows raw quoted literals as first arg.

function listTsx(dir: string, acc: string[] = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === '__tests__') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listTsx(full, acc); else if (/\.(tsx?|jsx?)$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

// Rough pattern: emitToastSuccess(<expr>) where <expr> starts with a quote
// We'll flag if not containing t(' inside the parentheses before first comma
const TOAST_CALL_RE = /(emitToastSuccess|emitToastError)\s*\(([^)]*)\)/g;

function isViolation(argSrc: string): boolean {
  const trimmed = argSrc.trim();
  if (trimmed.startsWith('t(')) return false;
  if (trimmed.startsWith('`')) return true; // template literal raw
  if (trimmed.startsWith("'") || trimmed.startsWith('"')) return true; // plain string literal
  return false; // variable or expression assumed fine
}

describe('toast literals guard', () => {
  it('disallows raw string literals in emitToast* calls', () => {
    const root = path.join(__dirname, '..');
    const files = listTsx(root);
    const violations: { file: string; snippet: string }[] = [];
    for (const f of files) {
      const text = readFileSync(f, 'utf8');
      let m: RegExpExecArray | null;
      while ((m = TOAST_CALL_RE.exec(text))) {
        const argSrc = m[2].split(',')[0];
        if (isViolation(argSrc)) {
          // Allowlist some legacy components if any (none expected now)
          violations.push({ file: f, snippet: argSrc.slice(0, 80) });
        }
      }
    }
    if (violations.length) {
      const lines = violations.map(v => ` - ${v.file}: ${v.snippet}`).join('\n');
      throw new Error(`Raw toast string literals detected (use t(...)):\n${lines}`);
    }
  });
});
