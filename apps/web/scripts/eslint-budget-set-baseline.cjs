#!/usr/bin/env node
/* eslint-disable */
/* eslint-env node */
/* Reads eslint-report.json, totals errors/warnings, and writes eslint-budget.json
 * to the current counts. Use once to capture a real baseline.
 */
const { readFileSync, writeFileSync, existsSync } = require('node:fs');

const REPORT = process.env.ESLINT_REPORT_PATH || 'eslint-report.json';
const BUDGET = 'eslint-budget.json';

if (!existsSync(REPORT)) {
  console.error(`[baseline] Missing ${REPORT}. Run: pnpm run lint:json`);
  process.exit(1);
}

let raw; try { raw = JSON.parse(readFileSync(REPORT, 'utf8')); } catch (e) {
  console.error('[baseline] Failed to parse report JSON:', e.message);
  process.exit(1);
}

let errors = 0, warnings = 0;
if (Array.isArray(raw)) {
  for (const f of raw) {
    errors += f.errorCount || 0;
    warnings += f.warningCount || 0;
  }
} else {
  console.error('[baseline] Unexpected report format (expected ESLint array)');
  process.exit(1);
}

const out = { errors, warnings, timestamp: new Date().toISOString() };
writeFileSync(BUDGET, JSON.stringify(out, null, 2) + '\n', 'utf8');
console.log(`[baseline] Wrote ${BUDGET}:`, out);
