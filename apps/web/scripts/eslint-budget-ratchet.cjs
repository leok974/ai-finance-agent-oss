#!/usr/bin/env node
/* eslint-env node */
// Auto-ratchets total and per-rule budgets downward when improvements occur.

const { readFileSync, writeFileSync, existsSync } = require('node:fs');

const REPORT = process.env.ESLINT_REPORT_PATH || 'eslint-report.json';
const TOTAL = 'eslint-budget.json';
const RULES = 'eslint-budget.rules.json';

if (!existsSync(REPORT)) {
  console.error(`[ratchet] Missing ${REPORT}. Run lint:json first.`);
  process.exit(2);
}

let data;
try {
  data = JSON.parse(readFileSync(REPORT, 'utf8'));
} catch (e) {
  console.error('[ratchet] Failed to parse report JSON:', e.message);
  process.exit(2);
}

let errors = 0, warnings = 0;
const ruleCounts = {};
for (const f of data) {
  errors += f.errorCount || 0;
  warnings += f.warningCount || 0;
  for (const m of (f.messages || [])) {
    const k = m.ruleId || '⟨no-rule⟩';
    ruleCounts[k] = (ruleCounts[k] || 0) + 1;
  }
}

if (existsSync(TOTAL)) {
  try {
    const b = JSON.parse(readFileSync(TOTAL, 'utf8'));
    const next = {
      errors: Math.min(b.errors ?? errors, errors),
      warnings: Math.min(b.warnings ?? warnings, warnings),
      timestamp: new Date().toISOString()
    };
    writeFileSync(TOTAL, JSON.stringify(next, null, 2) + '\n');
    console.log('[ratchet] totals →', next);
  } catch (e) {
    console.warn('[ratchet] Skipping totals ratchet (parse error):', e.message);
  }
}

if (existsSync(RULES)) {
  try {
    const rb = JSON.parse(readFileSync(RULES, 'utf8'));
    for (const [rule, limit] of Object.entries(rb)) {
      const cur = ruleCounts[rule] || 0;
      rb[rule] = Math.min(limit, cur);
    }
    writeFileSync(RULES, JSON.stringify(rb, null, 2) + '\n');
    console.log('[ratchet] rules → updated');
  } catch (e) {
    console.warn('[ratchet] Skipping per-rule ratchet (parse error):', e.message);
  }
}
