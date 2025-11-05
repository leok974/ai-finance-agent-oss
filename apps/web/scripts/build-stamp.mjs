#!/usr/bin/env node
/* eslint-disable */
import { execSync } from 'node:child_process';
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = join(__dirname, '..');

function safe(cmd, fallback) {
  try { return execSync(cmd, { stdio: ['ignore','pipe','ignore'] }).toString().trim(); } catch { return fallback; }
}

const stampPath = join(root, 'src', 'build-stamp.json');
if (process.env.RESPECT_EXISTING_STAMP === '1' && existsSync(stampPath)) {
  try {
    const existing = JSON.parse(readFileSync(stampPath, 'utf8'));
    console.log('[build-stamp] respecting existing src/build-stamp.json', existing);
    process.exit(0);
  } catch {}
}

const branch = process.env.GIT_BRANCH || safe('git rev-parse --abbrev-ref HEAD', 'unknown');
const commit = process.env.GIT_COMMIT || safe('git rev-parse --short HEAD', 'unknown');
const buildId = process.env.BUILD_ID || `${Date.now().toString(36)}`;
const stamp = { branch, commit, buildId, ts: new Date().toISOString() };

writeFileSync(stampPath, JSON.stringify(stamp, null, 2));
console.log('[build-stamp] wrote src/build-stamp.json', stamp);
