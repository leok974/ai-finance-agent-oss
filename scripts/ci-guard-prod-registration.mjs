#!/usr/bin/env node
// Simple guard: fail CI if docker-compose.prod.yml sets ALLOW_REGISTRATION to a truthy value
import fs from 'node:fs';
import path from 'node:path';

const composePath = path.resolve(process.cwd(), 'docker-compose.prod.yml');
const content = fs.readFileSync(composePath, 'utf8');

// Look for a line like ALLOW_REGISTRATION: "1" or true/yes
const re = /ALLOW_REGISTRATION\s*:\s*"?(1|true|True|yes|on)"?/;
if (re.test(content)) {
  console.error('[CI GUARD] ALLOW_REGISTRATION appears enabled in docker-compose.prod.yml.');
  process.exit(1);
}

console.log('[CI GUARD] Registration is disabled in prod compose. OK');
