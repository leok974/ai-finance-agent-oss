#!/usr/bin/env node
/* eslint-disable */
// Reads ESLint JSON report and prints a summary + writes Prometheus metrics optionally
// Usage: node scripts/eslint-metrics.cjs eslint-report.json [outProm=eslint.prom] [outJson=eslint-summary.json]

const fs = require('fs');

const inFile = process.argv[2] || 'eslint-report.json';
const outProm = process.argv[3] || 'eslint.prom';
const outJson = process.argv[4] || 'eslint-summary.json';

if (!fs.existsSync(inFile)) {
  console.error(`[eslint-metrics] missing ${inFile}`);
  process.exit(2);
}

const data = JSON.parse(fs.readFileSync(inFile, 'utf8'));
let errors = 0, warnings = 0;
const byRule = new Map();

for (const file of data) {
  for (const msg of file.messages || []) {
    if (msg.severity === 2) errors++;
    else if (msg.severity === 1) warnings++;
    const rule = msg.ruleId || 'non-rule';
    const key = `${rule}:${msg.severity}`;
    byRule.set(key, (byRule.get(key) || 0) + 1);
  }
}

const topRules = [...byRule.entries()]
  .map(([k, n]) => {
    const [rule, sev] = k.split(':');
    return { rule, level: sev === '2' ? 'error' : 'warn', count: n };
  })
  .sort((a, b) => b.count - a.count)
  .slice(0, 10);

const summary = { errors, warnings, topRules };
fs.writeFileSync(outJson, JSON.stringify(summary, null, 2));

let prom = '';
prom += `eslint_errors_total ${errors}\n`;
prom += `eslint_warnings_total ${warnings}\n`;
for (const r of topRules) {
  prom += `eslint_by_rule_total{rule="${r.rule}",level="${r.level}"} ${r.count}\n`;
}
fs.writeFileSync(outProm, prom);

console.log('[eslint] errors=%d warnings=%d', errors, warnings);
console.log('[eslint] top rules:', topRules.map(r => `${r.rule}:${r.level}=${r.count}`).join(', '));
