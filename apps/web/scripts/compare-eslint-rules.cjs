#!/usr/bin/env node
/* eslint-env node */
// Compares per-rule counts in eslint-report.json to eslint-budget.rules.json.
// Fails only if a tracked rule's count increases.

const { readFileSync, existsSync } = require('node:fs');

const REPORT = process.env.ESLINT_REPORT_PATH || 'eslint-report.json';
const RULE_BUDGET = 'eslint-budget.rules.json';

if (!existsSync(REPORT)) {
  console.error(`[eslint-rules-budget] Missing ${REPORT}. Run: pnpm run lint:json`);
  process.exit(2);
}
const data = JSON.parse(readFileSync(REPORT, 'utf8'));
const budgets = existsSync(RULE_BUDGET)
  ? JSON.parse(readFileSync(RULE_BUDGET, 'utf8'))
  : {};

const counts = {};
for (const f of data) {
  for (const m of f.messages || []) {
    const key = m.ruleId || '⟨no-rule⟩';
    counts[key] = (counts[key] || 0) + 1;
  }
}

let failed = false;
const failures = [];
for (const [rule, limit] of Object.entries(budgets)) {
  const current = counts[rule] || 0;
  if (current > limit) {
    failed = true;
    failures.push({ rule, current, limit });
  }
}

if (failed) {
  console.error('[eslint-rules-budget] Regressions:', failures);
  process.exit(1);
} else {
  console.log('[eslint-rules-budget] OK');
  process.exit(0);
}
