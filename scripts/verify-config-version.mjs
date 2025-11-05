#!/usr/bin/env node
/**
 * Verify that the X-Config-Version response header emitted by nginx
 * matches the sha256 hash of the original rendered config BEFORE
 * the placeholder replacement (i.e. hashing the config with
 * __CONFIG_VERSION__ tokens instead of the injected hex).
 *
 * Strategy:
 *  1. Curl the edge root (HEAD) to capture X-Config-Version.
 *  2. Identify the running nginx container (first matching name containing 'nginx' but excluding '-reloader').
 *  3. docker exec to read /etc/nginx/nginx.conf.
 *  4. Canonicalize: replace every occurrence of the header hash back to __CONFIG_VERSION__.
 *  5. sha256(hex) the canonical content.
 *  6. Compare to header value; exit 0 if match else non-zero.
 */
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';

function sh(cmd) {
  return execSync(cmd, { stdio: ['ignore', 'pipe', 'inherit'] }).toString();
}

function getHeaderHash(port) {
  const raw = sh(`curl -sI http://127.0.0.1:${port}/`);
  const line = raw.split(/\r?\n/).find(l => /^X-Config-Version:/i.test(l));
  if (!line) throw new Error('Missing X-Config-Version header');
  return line.split(/:/,2)[1].trim();
}

function pickNginxContainer() {
  const list = sh('docker ps --format "{{.Names}}"').split(/\r?\n/).filter(Boolean);
  const candidates = list.filter(n => /nginx/i.test(n) && !/reloader/i.test(n));
  if (candidates.length === 0) throw new Error('No nginx container found');
  if (candidates.length > 1) {
    // Not necessarily fatal, choose first but warn.
    console.warn('[warn] multiple nginx containers found:', candidates.join(', '));
  }
  return candidates[0];
}

function readConfig(container) {
  // Use double quotes around shell -c payload to avoid premature single-quote termination on Windows shells
  return sh(`docker exec ${container} sh -c "cat /etc/nginx/nginx.conf"`);
}

function sha256Hex(s) {
  return createHash('sha256').update(s,'utf8').digest('hex');
}

function main() {
  const port = process.env.EDGE_PORT || process.env.PORT || '80';
  let headerHash;
  try {
    headerHash = getHeaderHash(port);
  } catch (e) {
    console.error('[fail] could not obtain X-Config-Version header:', e.message);
    process.exit(2);
  }
  const container = pickNginxContainer();
  const liveConfig = readConfig(container);
  if (!liveConfig.includes('X-Config-Version')) {
    console.error('[fail] live config missing X-Config-Version directive');
    process.exit(2);
  }
  // Canonicalize by swapping the injected hash back to placeholder.
  const canonical = liveConfig.split(headerHash).join('__CONFIG_VERSION__');
  const recomputed = sha256Hex(canonical);
  if (recomputed !== headerHash) {
    console.error('[mismatch] header hash != recomputed canonical hash');
    console.error('  header    :', headerHash);
    console.error('  recomputed:', recomputed);
    process.exit(3);
  }
  console.log('[ok] Config version verified:', headerHash);
}

main();
