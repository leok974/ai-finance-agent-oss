#!/usr/bin/env node
// Edge compatibility & header verification script
// Usage: BASE=http://127.0.0.1 EDGE_PORT=80 EXPECT_COMPAT=1 node scripts/check-edge.mjs
// EXPECT_COMPAT=0 to disable compat alias assertions once removed.

const base = process.env.BASE || "http://127.0.0.1";
const port = process.env.EDGE_PORT || "80";
const compat = process.env.EXPECT_COMPAT !== "0"; // default true

const u = (p) => `${base}:${port}${p}`;
const fail = (m) => { console.error("❌", m); process.exit(1); };
const ok =  (m) => console.log("✅", m);

async function getI(p, opts={}) {
  const r = await fetch(u(p), { method: opts.method || 'GET', redirect: 'manual' });
  return { status: r.status, headers: r.headers };
}

(async () => {
  try {
    // /ready health
    const ready = await getI('/ready');
    if (ready.status !== 200) fail(`/ready expected 200 got ${ready.status}`); else ok('/ready 200');

    // /api/metrics alias 307 → /metrics
    const m = await getI('/api/metrics');
    const mLoc = m.headers.get('location');
    if (m.status !== 307 || mLoc !== '/metrics') fail(`/api/metrics expected 307→/metrics got ${m.status}→${mLoc}`);
    ok('/api/metrics 307 → /metrics');

    // Root headers
    const root = await getI('/');
    const csp = root.headers.get('content-security-policy');
    const ver = root.headers.get('x-config-version');
    if (!csp) fail('CSP header missing on /');
    if (!ver) fail('X-Config-Version missing on /');
    ok('CSP + X-Config-Version present');

    if (compat) {
      for (const p of ['/api/status', '/api/llm/health']) {
        const r = await getI(p);
        const loc = r.headers.get('location');
        if (r.status !== 307 || loc !== '/api/healthz') fail(`${p} expected 307→/api/healthz got ${r.status}→${loc}`);
        ok(`${p} 307 → /api/healthz`);
      }
    } else {
      console.log('Skipping compat alias checks (EXPECT_COMPAT=0)');
    }

    console.log('🎉 Edge checks passed.');
  } catch (e) {
    fail(e && e.message || String(e));
  }
})();
