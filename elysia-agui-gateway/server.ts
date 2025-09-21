// elysia-agui-gateway/server.ts
import { Elysia } from 'elysia';

// Backend base (FastAPI) inside Docker network
const BACKEND = process.env.BACKEND_BASE ?? 'http://backend:8000';
const PORT = process.env.PORT ? Number(process.env.PORT) : 3030;

type AguiEvent = {
  type: 'RUN_STARTED' | 'RUN_FINISHED' | 'TEXT_MESSAGE_CONTENT' | 'TOOL_CALL_START' | 'TOOL_CALL_ARGS' | 'TOOL_CALL_END';
  data?: any;
};

// Helper to write an SSE frame
function sseWrite(res: Response & { write?: (chunk: string) => void; flush?: () => void; socket?: any }, evt: AguiEvent) {
  const line = `event: ${evt.type}\ndata: ${JSON.stringify(evt.data ?? {})}\n\n`;
  // @ts-ignore Bun/Elysia Response extension
  res.write?.(line);
  try { res.flush?.(); } catch {}
}

async function callTool(path: string, payload: any, csrf?: string) {
  const r = await fetch(`${BACKEND}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
    },
    credentials: 'include',
    body: JSON.stringify(payload ?? {}),
  });
  if (!r.ok) throw new Error(`Tool call failed: ${path} ${r.status}`);
  return r.json();
}

const app = new Elysia()
  .get('/agui/ping', () => 'ok')
  .get('/agui/chat', async ({ request, set }) => {
    set.headers = {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // allow streaming through nginx
    } as any;

    const url = new URL(request.url);
    const month = url.searchParams.get('month') || undefined;
    const question = url.searchParams.get('q') || 'Give me this month overview';
    const csrf = url.searchParams.get('csrf') || undefined;

    // @ts-ignore create streaming response
    const res = new Response();
    // Proactively open the stream so the client can start listening
    // @ts-ignore
    res.write?.('');

    sseWrite(res as any, { type: 'RUN_STARTED', data: { ts: Date.now(), mode: 'chat' } });
    try {
      // charts.summary
      sseWrite(res as any, { type: 'TOOL_CALL_START', data: { name: 'charts.summary' } });
      const summary = await callTool('/agent/tools/charts/summary', { month }, csrf);
      sseWrite(res as any, { type: 'TOOL_CALL_END', data: { name: 'charts.summary', ok: true } });

      // charts.merchants
      sseWrite(res as any, { type: 'TOOL_CALL_START', data: { name: 'charts.merchants' } });
      const merchants = await callTool('/agent/tools/charts/merchants', { month, limit: 5 }, csrf);
      sseWrite(res as any, { type: 'TOOL_CALL_END', data: { name: 'charts.merchants', ok: true } });

      // agent.chat (rephrase / compose final answer using agent's normal path)
      sseWrite(res as any, { type: 'TOOL_CALL_START', data: { name: 'agent.chat' } });
      const rephrase = await fetch(`${BACKEND}/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(csrf ? { 'X-CSRF-Token': csrf } : {}) },
        credentials: 'include',
        body: JSON.stringify({
          messages: [
            { role: 'user', content: `${question}. Use the data I've fetched.` },
          ],
          context: { summary, merchants },
        }),
      }).then(r => r.json());
      sseWrite(res as any, { type: 'TOOL_CALL_END', data: { name: 'agent.chat', ok: true } });

      const text: string = rephrase?.reply ?? 'Here is your overview.';
      const chunks = text.match(/.{1,120}(\s|$)/g) ?? [text];
      for (const chunk of chunks) {
        await (globalThis as any).Bun?.sleep?.(20);
        sseWrite(res as any, { type: 'TEXT_MESSAGE_CONTENT', data: { text: chunk } });
      }
    } catch (e: any) {
      sseWrite(res as any, { type: 'TEXT_MESSAGE_CONTENT', data: { text: `Error: ${e?.message || String(e)}` } });
    } finally {
      sseWrite(res as any, { type: 'RUN_FINISHED', data: { ts: Date.now() } });
      // Close out
      // @ts-ignore
      res.write?.('event: close\ndata: {}\n\n');
      try { // @ts-ignore
        res.flush?.(); } catch {}
      // @ts-ignore
      res.socket?.end?.();
    }
    return res;
  });

app.listen(PORT);
console.log(`[agui] Elysia gateway listening on :${PORT} -> backend ${BACKEND}`);
