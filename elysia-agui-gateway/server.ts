// elysia-agui-gateway/server.ts
import { Elysia } from 'elysia';

// Backend base (FastAPI) inside Docker network
const BACKEND = process.env.BACKEND_BASE ?? 'http://backend:8000';
const PORT = process.env.PORT ? Number(process.env.PORT) : 3030;

type AguiEventType = 'RUN_STARTED' | 'RUN_FINISHED' | 'TEXT_MESSAGE_CONTENT' | 'TOOL_CALL_START' | 'TOOL_CALL_ARGS' | 'TOOL_CALL_END' | 'ERROR';
interface AguiEvent { type: AguiEventType; data?: any }

function encodeEvent(evt: AguiEvent): string {
  return `event: ${evt.type}\ndata: ${JSON.stringify(evt.data ?? {})}\n\n`;
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
  .get('/agui/chat', ({ request, set }: { request: Request; set: any }) => {
    set.headers = {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    } as any;

    const url = new URL(request.url);
    const month = url.searchParams.get('month') || undefined;
    const question = url.searchParams.get('q') || 'Give me this month overview';
    const csrf = url.searchParams.get('csrf') || undefined;

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const write = (evt: AguiEvent) => controller.enqueue(new TextEncoder().encode(encodeEvent(evt)));
        write({ type: 'RUN_STARTED', data: { ts: Date.now(), mode: 'chat' } });
        try {
          write({ type: 'TOOL_CALL_START', data: { name: 'charts.summary' } });
          const summary = await callTool('/agent/tools/charts/summary', { month }, csrf);
          write({ type: 'TOOL_CALL_END', data: { name: 'charts.summary', ok: true } });

          write({ type: 'TOOL_CALL_START', data: { name: 'charts.merchants' } });
          const merchants = await callTool('/agent/tools/charts/merchants', { month, limit: 5 }, csrf);
          write({ type: 'TOOL_CALL_END', data: { name: 'charts.merchants', ok: true } });

          write({ type: 'TOOL_CALL_START', data: { name: 'agent.chat' } });
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
          write({ type: 'TOOL_CALL_END', data: { name: 'agent.chat', ok: true } });

          const text: string = rephrase?.reply ?? 'Here is your overview.';
          const chunks = text.match(/.{1,120}(\s|$)/g) ?? [text];
          for (const chunk of chunks) {
            await (globalThis as any).Bun?.sleep?.(15);
            write({ type: 'TEXT_MESSAGE_CONTENT', data: { text: chunk } });
          }
        } catch (e: any) {
          write({ type: 'ERROR', data: { message: e?.message || String(e) } });
        } finally {
          write({ type: 'RUN_FINISHED', data: { ts: Date.now() } });
          controller.close();
        }
      },
      cancel() { /* client disconnected */ }
    });
    return new Response(stream);
  });

app.listen(PORT);
console.log(`[agui] Elysia gateway listening on :${PORT} -> backend ${BACKEND}`);
