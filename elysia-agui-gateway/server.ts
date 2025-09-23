// elysia-agui-gateway/server.ts
import { Elysia } from 'elysia';

const BACKEND = process.env.BACKEND_BASE ?? 'http://backend:8000';
const PORT = Number(process.env.PORT ?? 3030);

type AguiEvent =
  | { type: 'INTENT_DETECTED'; data?: any }
  | { type: 'RUN_STARTED'; data?: any }
  | { type: 'RUN_FINISHED'; data?: any }
  | { type: 'TEXT_MESSAGE_CONTENT'; data: { text: string } }
  | { type: 'TOOL_CALL_START'; data: { name: string } }
  | { type: 'TOOL_CALL_END'; data: { name: string; ok: boolean; error?: string } }
  | { type: 'SUGGESTIONS'; data: { chips: Array<{ label: string; action: string }> } };

const enc = new TextEncoder();
const sse = (evt: AguiEvent) =>
  enc.encode(`event: ${evt.type}\ndata: ${JSON.stringify(evt.data ?? {})}\n\n`);

async function callTool(path: string, body: any, csrf?: string) {
  const r = await fetch(`${BACKEND}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(csrf ? { 'X-CSRF-Token': csrf } : {})
    },
    credentials: 'include',
    body: JSON.stringify(body ?? {})
  });
  if (!r.ok) throw new Error(`${path} ${r.status}`);
  return r.json();
}

// ---- lightweight cache -----------------------------------------------------
type CacheKey = string;
const cache = new Map<CacheKey, { at: number; data: any }>();
const TTL_MS = 20_000; // 20s
const ck = (intent: string, month?: string | null, q?: string) => `${intent}::${month ?? ''}::${(q ?? '').slice(0,64)}`;
function getCache(key: CacheKey) {
  const v = cache.get(key); if (!v) return;
  if (Date.now() - v.at < TTL_MS) return v.data;
  cache.delete(key);
}
function setCache(key: CacheKey, data: any) { cache.set(key, { at: Date.now(), data }); }

// ---- intent detection -------------------------------------------------------
function detectIntent(q: string) {
  const s = q.toLowerCase();
  const has = (...ks: string[]) => ks.some(k => s.includes(k));

  if (has('overview','month summary','monthly summary','summary','what happened','how did i spend'))
    return 'overview';
  if (has('top merchant','top merchants','merchant'))
    return 'merchants';
  if (has('kpi','kpis','key performance'))
    return 'kpis';
  if (has('subscription','recurring','recurrence'))
    return 'subscriptions';
  if (has('alert','alerts','anomal','flag','spike'))
    return 'alerts';
  if (has('budget','target','suggest budget','budget suggest'))
    return 'budget';
  if (has('cashflow','cash flow'))
    return 'cashflow';
  if (has('anomaly','anomalies','outlier','spike'))
    return 'anomalies';
  if (has('forecast','projection','predict','next month'))
    return 'forecast';
  if (has('what if','what-if','scenario','simulate','suppose'))
    return 'what-if';
  if (has('search','find transaction','list transaction','txns','transactions'))
    return 'txns';
  return 'chat';
}

new Elysia()
  .get('/agui/ping', () => 'ok')
  .get('/agui/chat', async ({ request, set }: { request: Request; set: any }) => {
    set.headers = {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    };

    const url = new URL(request.url);
    const month = url.searchParams.get('month') || undefined;
    const q = url.searchParams.get('q') || 'Give me this month overview';
    const csrf = url.searchParams.get('csrf') || undefined;
    const mode = url.searchParams.get('mode') as string | null;
  const intent = (mode as any) || detectIntent(q);

    const stream = new ReadableStream<Uint8Array>({
      async start(controller: ReadableStreamDefaultController<Uint8Array>) {
        const push = (evt: AguiEvent) => controller.enqueue(sse(evt));
        const meta = { ts: Date.now(), intent, month };
        push({ type: 'INTENT_DETECTED', data: meta });
        push({ type: 'RUN_STARTED', data: meta });

        try {
          let summary: any = null;
            let merchants: any = null;
            const extra: Record<string, any> = {};
            const failures: string[] = [];

          // ---- Branch by intent (only call what’s needed) -------------------
          const guarded = async (name: string, path: string, body: any, assign: (out:any)=>void, cacheKey?: string) => {
            if (cacheKey) {
              const hit = getCache(cacheKey);
              if (hit) { assign(hit); return; }
            }
            push({ type: 'TOOL_CALL_START', data: { name } });
            try {
              const out = await callTool(path, body, csrf);
              assign(out);
              if (cacheKey) setCache(cacheKey, out);
              push({ type: 'TOOL_CALL_END', data: { name, ok: true } });
            } catch (err: any) {
              failures.push(name);
              assign(undefined);
              const msg = String(err?.message || err || 'error');
              (extra as any)[`${name.split('.').pop()}Error`] = msg;
              push({ type: 'TOOL_CALL_END', data: { name, ok: false, error: msg } });
            }
          };

          if (intent === 'overview') {
            await guarded('charts.summary', '/agent/tools/charts/summary', { month }, (o)=>{ summary = o; });
            await guarded('charts.merchants', '/agent/tools/charts/merchants', { month, limit: 10 }, (o)=>{ merchants = o; });
          }

          if (intent === 'merchants') {
            await guarded('charts.merchants', '/agent/tools/charts/merchants', { month, limit: 15 }, (o)=>{ merchants = o; });
          }

          if (intent === 'kpis') {
            await guarded('analytics.kpis', '/agent/tools/analytics/kpis', { month }, (o)=>{ extra.kpis = o; }, ck('kpis', month));
          }

          if (intent === 'subscriptions') {
            await guarded('analytics.recurring', '/agent/tools/analytics/recurring', { month }, (o)=>{ extra.subscriptions = o; }, ck('subscriptions', month));
          }

          if (intent === 'alerts') {
            await guarded('analytics.alerts', '/agent/tools/analytics/alerts', { month }, (o)=>{ extra.alerts = o; }, ck('alerts', month));
          }

          if (intent === 'budget') {
            await guarded('analytics.budget_suggest', '/agent/tools/analytics/budget/suggest', { month }, (o)=>{ extra.budget = o; }, ck('budget', month));
          }

          if (intent === 'cashflow') {
            await guarded('charts.cashflow', '/agent/tools/charts/cashflow', { month }, (o)=>{ extra.cashflow = o; }, ck('cashflow', month));
          }

          if (intent === 'txns') {
            await guarded('txns.query', '/agent/txns_query', { q, month, limit: 50 }, (o)=>{ extra.txns = o; }); // no cache (query specific)
          }

          if (intent === 'anomalies') {
            await guarded('analytics.anomalies', '/agent/tools/analytics/anomalies', { month }, (o)=>{ extra.anomalies = o; }, ck('anomalies', month));
          }

          if (intent === 'forecast') {
            await guarded('analytics.forecast.cashflow', '/agent/tools/analytics/forecast/cashflow', { month }, (o)=>{ extra.forecast = o; }, ck('forecast', month));
          }

          if (intent === 'what-if') {
            await guarded('analytics.what_if', '/agent/tools/analytics/what_if', { month, scenario: q }, (o)=>{ extra.whatIf = o; });
          }

          // ---- Rephrase / final message -------------------------------------
          push({ type: 'TOOL_CALL_START', data: { name: 'agent.chat' } });
          const context: Record<string, any> = { intent, month };
          if (summary) context.summary = summary;
          if (merchants) context.merchants = merchants;
          Object.assign(context, extra);
          const failureKeys: string[] = [];
          for (const k of ['kpis','subscriptions','alerts','anomalies','budget','cashflow','forecast','whatIf','txns']) {
            if ((extra as any)[`${k}Error`]) failureKeys.push(k);
          }
          if (failureKeys.length) context.failures = failureKeys;
          const reply = await fetch(`${BACKEND}/agent/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(csrf ? { 'X-CSRF-Token': csrf } : {}) },
            credentials: 'include',
            body: JSON.stringify({
              messages: [{ role: 'user', content: q }],
              context
            })
          }).then((r: Response) => r.json());
          push({ type: 'TOOL_CALL_END', data: { name: 'agent.chat', ok: true } });

          const text: string =
            reply?.reply ??
            (intent === 'chat'
              ? "Hey! How can I help with your finances?"
              : "Here’s what I found.");

          const chunks = text.match(/.{1,120}(\s|$)/g) ?? [text];
          const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
          for (const c of chunks) {
            await sleep(18);
            push({ type: 'TEXT_MESSAGE_CONTENT', data: { text: c } });
          }
        } catch (e: any) {
          push({ type: 'TEXT_MESSAGE_CONTENT', data: { text: `Error: ${e.message}` } });
        } finally {
          // Intent-based suggestion chips (lightweight hints for follow-on actions)
          if (intent === 'forecast') {
            push({ type: 'SUGGESTIONS', data: { chips: [
              { label: 'Set budget from forecast', action: 'budget_from_forecast' },
              { label: 'Compare vs last month', action: 'compare_prev' }
            ] } });
          } else if (intent === 'what-if') {
            push({ type: 'SUGGESTIONS', data: { chips: [
              { label: 'Apply change to budget', action: 'apply_budget' },
              { label: 'Save as rule', action: 'save_rule' }
            ] } });
          }
          push({ type: 'RUN_FINISHED', data: { ts: Date.now() } });
          controller.close();
        }
      }
    });
    return new Response(stream);
  })
  .listen(PORT);

console.log(`[agui] Elysia gateway listening on :${PORT} -> backend ${BACKEND}`);
