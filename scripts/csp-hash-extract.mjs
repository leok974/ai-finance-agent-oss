#!/usr/bin/env node
/**
 * Generate CSP script-src hash placeholders replacement.
 *
 * Process:
 * 1. Read deploy/nginx.conf template (with __INLINE_SCRIPT_HASHES__ tokens)
 * 2. Parse built index.html (default: apps/web/dist/index.html) gathering <script>...</script> inline blocks with no src.
 * 3. Compute SHA-256 base64 hashes of each inline script body (trim whitespace, preserve exact text for hashing spec).
 * 4. Emit JSON manifest (.github/csp/inline-script-hashes.json) for auditing.
 * 5. Produce deploy/nginx.conf.rendered with token replaced by all hashes as `'sha256-<hash>'` list.
 * 6. Optionally verify that rendered file no longer contains the placeholder.
 *
 * Exit codes:
 *  0 success
 *  2 if placeholder missing in template
 *  3 if no inline scripts found (treated as soft warning but non-zero to force pipeline decision)
 *  4 if placeholder still present after render
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { createHash } from 'crypto';
import { resolve } from 'path';

const projectRoot = resolve(process.cwd());

// Simple arg parsing: --key value (boolean flags appear with true) --allow-empty
function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const cur = argv[i];
    if (cur.startsWith('--')) {
      const key = cur.slice(2);
      // boolean flag if next is another -- or end
      if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) {
        args[key] = true;
      } else {
        args[key] = argv[i + 1];
        i++;
      }
    }
  }
  return args;
}

const args = parseArgs(process.argv);
const nginxTemplatePath = resolve(projectRoot, args.in || 'deploy/nginx.conf');
const nginxRenderedPath = resolve(projectRoot, args.out || 'deploy/nginx.conf.rendered');
const indexHtmlPath = resolve(projectRoot, args.html || 'apps/web/dist/index.html');
const manifestDir = resolve(projectRoot, '.github', 'csp');
const manifestPath = resolve(manifestDir, 'inline-script-hashes.json');

function hashInline(content) {
  const h = createHash('sha256');
  h.update(content);
  return h.digest('base64');
}
function sha256Hex(content) {
  const h = createHash('sha256');
  h.update(content);
  return h.digest('hex');
}

function extractInlineScripts(html) {
  const scripts = [];
  // naive but effective: match <script ...>...</script> where no src attribute
  const regex = /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = regex.exec(html)) !== null) {
    const body = m[2];
    const trimmed = body.trim();
    if (trimmed.length === 0) continue; // ignore empty wrappers
    scripts.push(trimmed);
  }
  return scripts;
}

function main() {
  const template = readFileSync(nginxTemplatePath, 'utf8');
  if (!template.includes('__INLINE_SCRIPT_HASHES__')) {
    console.error('Placeholder __INLINE_SCRIPT_HASHES__ not found in deploy/nginx.conf');
    process.exit(2);
  }
  let html;
  try {
    html = readFileSync(indexHtmlPath, 'utf8');
  } catch (e) {
    console.error('Failed to read built index.html at', indexHtmlPath);
    throw e;
  }
  const inlineScripts = extractInlineScripts(html);
  const hadNone = inlineScripts.length === 0;
  if (hadNone) {
    console.warn('No inline scripts found in index.html. Consider removing placeholder from CSP (or keep placeholder for future).');
  }
  const hashes = inlineScripts.map(src => `sha256-${hashInline(src)}`);
  const replacement = hashes.map(h => `'${h}'`).join(' ');
  let rendered = template.replace(/__INLINE_SCRIPT_HASHES__/g, replacement);
  // Inject config version hash
  const configVersion = sha256Hex(rendered);
  rendered = rendered.replace(/__CONFIG_VERSION__/g, configVersion);

  if (!existsSync(manifestDir)) mkdirSync(manifestDir, { recursive: true });
  writeFileSync(manifestPath, JSON.stringify({ generatedAt: new Date().toISOString(), count: hashes.length, hashes }, null, 2));
  writeFileSync(nginxRenderedPath, rendered);

  if (rendered.includes('__INLINE_SCRIPT_HASHES__')) {
    console.error('Rendered nginx.conf still contains placeholder; replacement failed.');
    process.exit(4);
  }
  if (hadNone && !args['allow-empty']) {
    // Soft-fail: exit code 3 to signal pipeline decision point.
    process.exit(3);
  }
  console.log(`Generated ${hashes.length} script hash(es). (allow-empty=${Boolean(args['allow-empty'])})`);
  console.log(`Config version (sha256): ${configVersion}`);
}

main();
