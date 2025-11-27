#!/usr/bin/env node
/**
 * Cloudflare purge for current build with:
 *  - changed-only mode (skip if index.html unchanged)
 *  - retries with backoff on 429/5xx
 *  - dry-run support
 *
 * Env:
 *   CLOUDFLARE_API_TOKEN (zone.cache_purge)
 *   CLOUDFLARE_ZONE_ID
 * Args:
 *   --base=https://app.ledger-mind.org
 *   --dist=apps/web/dist
 *   --extra=/site.webmanifest,/favicon.ico
 *   --onlyIfChanged=1
 *   --snapshot=.cf-purge.last.json
 *   --retries=5
 *   --backoffMs=500
 *   --dryRun=1
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const token = process.env.CLOUDFLARE_API_TOKEN || '';
const zone  = process.env.CLOUDFLARE_ZONE_ID || '';
const args  = Object.fromEntries(process.argv.slice(2).map(a=>{ const [k,v='1']=a.replace(/^--/,'').split('='); return [k,v]; }));

const base = (args.base || '').replace(/\/+$/,'');
const dist = args.dist || 'apps/web/dist';
const extrasCsv = args.extra || '/site.webmanifest,/favicon.ico';
const onlyIfChanged = args.onlyIfChanged === '1';
const snapshotPath = args.snapshot || '.cf-purge.last.json';
const retries = Math.max(0, parseInt(args.retries || '5',10));
const backoffMs = Math.max(100, parseInt(args.backoffMs || '500',10));
const dryRun = args.dryRun === '1';

if (!base) { console.error('Usage: cf-purge.js --base=<url> [--dist=apps/web/dist]'); process.exit(2); }
if (!zone) { console.error('Set CLOUDFLARE_ZONE_ID'); process.exit(2); }
if (!token && !(process.env.CLOUDFLARE_GLOBAL_KEY && process.env.CLOUDFLARE_EMAIL)) {
  console.error('Set CLOUDFLARE_API_TOKEN or (CLOUDFLARE_GLOBAL_KEY & CLOUDFLARE_EMAIL)');
  process.exit(2);
}

const indexPath = path.join(dist, 'index.html');
if (!fs.existsSync(indexPath)) { console.error(`index.html not found at ${indexPath}`); process.exit(2); }

const html = fs.readFileSync(indexPath, 'utf8');
const hash = crypto.createHash('sha256').update(html).digest('hex');

const assets = new Set();
for (const m of html.matchAll(/<script[^>]+src=["']([^"']+\.m?js)["']/gi)) assets.add(m[1]);
for (const m of html.matchAll(/<link[^>]+href=["']([^"']+\.css)["']/gi)) assets.add(m[1]);
const extras = extrasCsv.split(',').map(s=>s.trim()).filter(Boolean);

const urls = new Set([
  `${base}/`,
  `${base}/index.html`,
  ...[...assets].map(a => a.startsWith('http') ? a : `${base}${a}`),
  ...extras.map(e => e.startsWith('http') ? e : `${base}${e.startsWith('/')?e:'/'+e}`)
]);

let prev = null;
if (onlyIfChanged && fs.existsSync(snapshotPath)) {
  try { prev = JSON.parse(fs.readFileSync(snapshotPath,'utf8')); } catch {}
}
if (onlyIfChanged && prev?.indexHash === hash) {
  console.log('No change in index.html; skipping purge.');
  process.exit(0);
}

function authHeaders(){
  if (process.env.CLOUDFLARE_API_TOKEN) {
    return { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}` };
  }
  const k = process.env.CLOUDFLARE_GLOBAL_KEY;
  const e = process.env.CLOUDFLARE_EMAIL;
  if (k && e) return { 'X-Auth-Key': k, 'X-Auth-Email': e };
  return {}; // earlier validation prevents reaching here
}

async function parseCf(res, text) {
  try {
    const j = JSON.parse(text);
    const ok = j.success === true;
    const errs = Array.isArray(j.errors) ? j.errors.map(e => `${e.code}: ${e.message}`).join('; ') : '';
    const msgs = Array.isArray(j.messages) ? j.messages.map(m => m.message || '').join('; ') : '';
    return { ok, errs, msgs };
  } catch {
    return { ok: false, errs: `Non-JSON response (status ${res.status})`, msgs: text.slice(0,200) };
  }
}

async function purge(list){
  const body = JSON.stringify({ files: list });
  const url = `https://api.cloudflare.com/client/v4/zones/${zone}/purge_cache`;
  for (let attempt=0;;attempt++) {
    if (dryRun) { console.log(`[dry-run] Would purge ${list.length} URLs:\n`+list.join('\n')); return true; }
    const res = await fetch(url,{ method:'POST', headers:{ ...authHeaders(), 'Content-Type':'application/json'}, body });
    let txt = '';
    try { txt = await res.text(); } catch { txt = ''; }
    const { ok, errs, msgs } = await parseCf(res, txt);
    if (ok) {
      console.log(`Purged ${list.length} URLs:`); console.log(list.join('\n')); return true;
    }
    const retryable = res.status===429 || res.status>=500;
    if (!retryable || attempt>=retries) {
      const detail = [errs, msgs].filter(Boolean).join(' | ');
      console.error(`Purge failed (status ${res.status}) attempt ${attempt+1}/${retries+1}${detail?': '+detail:''}`);
      return false;
    }
    const sleep = backoffMs * Math.pow(2, attempt) + Math.floor(Math.random()*250);
    console.warn(`Retrying in ${sleep}ms...`);
    await new Promise(r=>setTimeout(r,sleep));
  }
}

const ok = await purge([...urls]);
if (!ok) process.exit(1);

try {
  fs.writeFileSync(snapshotPath, JSON.stringify({ indexHash: hash, at: new Date().toISOString(), urls:[...urls] }, null, 2));
} catch {}
