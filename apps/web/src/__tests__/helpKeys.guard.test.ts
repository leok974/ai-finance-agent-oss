import { describe, it, expect } from 'vitest';
import { dictionaries } from '@/lib/i18n';
import fs from 'fs';
import path from 'path';

// Guard test: ensure all cardId/data-help-key usages correspond to known card keys or explicitly whitelisted extra keys.

describe('Help key integrity', () => {
  it('contains no unknown help component names', () => {
  // Scan only real source (exclude test files themselves to avoid synthetic keys in fixtures)
  const root = path.resolve(__dirname, '..');
    const files: string[] = [];
    function walk(dir: string) {
      for (const entry of fs.readdirSync(dir)) {
        const full = path.join(dir, entry);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
          if (!/node_modules|dist|coverage|__tests__/.test(full)) walk(full);
        } else if (/\.(tsx|ts|jsx|js)$/.test(entry)) {
          if (!/__tests__/.test(full)) files.push(full);
        }
      }
    }
    walk(root);

    const content = files.map(f => fs.readFileSync(f, 'utf8')).join('\n');

    // Match cardId="cards.something" or data-help-key="cards.something"
    const regex = /(?:cardId|data-help-key)="([a-zA-Z0-9_.-]+)"/g;
    const found = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = regex.exec(content))) {
      found.add(m[1]);
    }

    // Derive allowed base keys from dictionaries.en.cards + explicit additional namespaces we use
    const en = (dictionaries as any).en || {};
    const cardsDict = en.cards || {};
    const chartsDict = en.charts || {};
    const allowed = new Set<string>([
      ...Object.keys(cardsDict).map(k => `cards.${k}`),
      ...Object.keys(chartsDict).map(k => `charts.${k}`),
    ]);

    // You can add manual exceptions here if needed
    const exceptions: string[] = [
      // Non-card namespaced keys intentionally used:
      'card.forecast',
      'anomalies.month',
      'cards.insights_list'
    ];
    exceptions.forEach(e => allowed.add(e));

  // Only enforce for known prefixes we manage.
  const enforced = [...found].filter(k => /^(cards|charts|card\.|anomalies\.)/.test(k));
  const unknown = enforced.filter(k => !allowed.has(k));
    if (unknown.length) {
      // Provide a helpful diff for developers
      console.error('Unknown help keys encountered:', unknown);
    }
    expect(unknown).toEqual([]);
  });
});
