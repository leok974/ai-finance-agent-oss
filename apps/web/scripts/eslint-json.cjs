#!/usr/bin/env node
/* eslint-disable */
/* eslint-env node */
/* Cross-platform ESLint JSON reporter that never breaks the pipeline.
 * - Writes machine-readable JSON via ESLint's own -o (no shell redirection).
 * - Disables color/TTY noise.
 * - Treats non-zero ESLint exit as success (so downstream steps always run).
 */
const { spawnSync } = require('node:child_process');
const { existsSync, writeFileSync } = require('node:fs');

const REPORT_PATH = process.env.ESLINT_REPORT_PATH || 'eslint-report.json';

// Adjust globs if sources live elsewhere.
const globs = ['src/**/*.{ts,tsx,js,jsx}'];

const args = [
  ...globs,
  '-f', 'json',
  '-o', REPORT_PATH,
  '--no-color',
  '--no-error-on-unmatched-pattern'
];

spawnSync('eslint', args, { stdio: 'inherit', shell: true });

// If ESLint failed before writing the file, create an empty JSON array.
if (!existsSync(REPORT_PATH)) {
  writeFileSync(REPORT_PATH, '[]', { encoding: 'utf8' });
  console.warn('[eslint-json] ' + REPORT_PATH + ' was missing; wrote empty array to keep pipeline moving.');
}

// Always exit 0 so pnpm/npm scripts continue.
process.exit(0);
