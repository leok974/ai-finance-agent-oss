// elysia-agui-gateway/server.ts
import { Elysia } from 'elysia';

const BACKEND = process.env.BACKEND_BASE ?? 'http://backend:8000';
const PORT = Number(process.env.PORT ?? 3030);

type AguiEvent =
  | { type: 'RUN_STARTED'; data?: any }
  | { type: 'RUN_FINISHED'; data?: any }
  | { type: 'TEXT_MESSAGE_CONTENT'; data: { text: string } }
  | { type: 'TOOL_CALL_START'; data: { name: string } }
  | { type: 'TOOL_CALL_END'; data: { name: string; ok: boolean } };

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

new Elysia()
  .get('/agui/ping', () => 'ok')
  .get('/agui/chat', async ({ request, set }) => {
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

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const push = (evt: AguiEvent) => controller.enqueue(sse(evt));
        push({ type: 'RUN_STARTED', data: { ts: Date.now() } });

        try {
          // charts.summary
          push({ type: 'TOOL_CALL_START', data: { name: 'charts.summary' } });
          const summary = await callTool('/agent/tools/charts/summary', { month }, csrf);
            push({ type: 'TOOL_CALL_END', data: { name: 'charts.summary', ok: true } });

          // charts.merchants
          push({ type: 'TOOL_CALL_START', data: { name: 'charts.merchants' } });
          const merchants = await callTool('/agent/tools/charts/merchants', { month, limit: 5 }, csrf);
          push({ type: 'TOOL_CALL_END', data: { name: 'charts.merchants', ok: true } });

          // rephrase via /agent/chat
          push({ type: 'TOOL_CALL_START', data: { name: 'agent.chat' } });
          const reply = await fetch(`${BACKEND}/agent/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(csrf ? { 'X-CSRF-Token': csrf } : {}) },
            credentials: 'include',
            body: JSON.stringify({
              messages: [{ role: 'user', content: `${q}. Use the data I've fetched.` }],
              context: { summary, merchants }
            })
          }).then(r => r.json());
          push({ type: 'TOOL_CALL_END', data: { name: 'agent.chat', ok: true } });

          const text: string = reply?.reply ?? 'Here is your overview.';
          const chunks = text.match(/.{1,120}(\s|$)/g) ?? [text];
          for (const c of chunks) {
            await Bun.sleep(18);
            push({ type: 'TEXT_MESSAGE_CONTENT', data: { text: c } });
          }
        } catch (e: any) {
          push({ type: 'TEXT_MESSAGE_CONTENT', data: { text: `Error: ${e.message}` } });
        } finally {
          push({ type: 'RUN_FINISHED', data: { ts: Date.now() } });
          controller.close();
        }
      }
    });

    return new Response(stream);
  })
  .listen(PORT);

console.log(`[agui] Elysia gateway listening on :${PORT} -> backend ${BACKEND}`);
