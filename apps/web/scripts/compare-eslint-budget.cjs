#!/usr/bin/env node
// Compares current ESLint JSON *full report* or summary to a budget file.
// Usage:
//  node scripts/compare-eslint-budget.cjs <reportOrSummary.json> <budget.json> [allowedErrorDelta] [allowedWarnDelta]
// Notes:
//  - If input JSON has shape { errors, warnings }, it's treated as a summary.
//  - Otherwise expects ESLint full array format.
//  - allowed*Delta lets you permit temporary increases (default 0 / 0).

const fs = require('fs');

const reportPath = process.argv[2] || 'eslint-report.json';
const budgetPath = process.argv[3] || 'eslint-budget.json';
const allowedErrorDelta = parseInt(process.argv[4] || '0', 10);
const allowedWarnDelta = parseInt(process.argv[5] || '0', 10);

if (!fs.existsSync(reportPath)) {
  console.error(`[eslint-budget] missing report ${reportPath}`);
  process.exit(2);
}
if (!fs.existsSync(budgetPath)) {
  console.error(`[eslint-budget] missing budget ${budgetPath}`);
  process.exit(2);
}

const parsed = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const budget = JSON.parse(fs.readFileSync(budgetPath, 'utf8'));

let errors = 0, warnings = 0;
if (Array.isArray(parsed)) {
  for (const file of parsed) {
    for (const msg of file.messages || []) {
      if (msg.severity === 2) errors++;
      else if (msg.severity === 1) warnings++;
    }
  }
} else if (typeof parsed === 'object' && parsed) {
  if (typeof parsed.errors === 'number' && typeof parsed.warnings === 'number') {
    errors = parsed.errors;
    warnings = parsed.warnings;
  } else {
    console.error('[eslint-budget] Unrecognized summary object format');
    process.exit(2);
  }
} else {
  console.error('[eslint-budget] Unsupported report JSON shape');
  process.exit(2);
}

const overErrorsRaw = errors - (budget.errors ?? 0);
const overWarningsRaw = warnings - (budget.warnings ?? 0);
const overErrors = overErrorsRaw - allowedErrorDelta;
const overWarnings = overWarningsRaw - allowedWarnDelta;

console.log(`[eslint-budget] current errors=${errors} warnings=${warnings} (budget errors=${budget.errors} warnings=${budget.warnings})`);
if (allowedErrorDelta || allowedWarnDelta) {
  console.log(`[eslint-budget] permitted deltas errors=+${allowedErrorDelta} warnings=+${allowedWarnDelta}`);
}

let failed = false;
if (overErrors > 0) {
  console.error(`[eslint-budget] ERROR over budget by ${overErrors}`);
  failed = true;
}
if (overWarnings > 0) {
  console.error(`[eslint-budget] WARN over budget by ${overWarnings}`);
  failed = true;
}

if (!failed) {
  console.log('[eslint-budget] within budget');
}
process.exit(failed ? 1 : 0);
