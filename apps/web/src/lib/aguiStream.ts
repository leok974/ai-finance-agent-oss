export type AguiHandlers = {
  onStart?(meta: { intent?: string; month?: string; ts?: number }): void;
  onIntent?(intent: string, meta: any): void;
  onToolStart?(name: string): void;
  onToolEnd?(name: string, ok: boolean, error?: string): void;
  onChunk?(text: string): void;
  onFinish?(): void;
  onError?(err: any): void;
  onSuggestions?(chips: Array<{ label: string; action: string }>): void;
};

export function wireAguiStream(
  params: { q: string; month?: string; mode?: string },
  h: AguiHandlers
) {
  const { q, month, mode } = params;
  const url = new URL('/agui/chat', window.location.origin);
  url.searchParams.set('q', q);
  if (month) url.searchParams.set('month', month);
  if (mode)  url.searchParams.set('mode', mode);

  const es = new EventSource(url.toString(), { withCredentials: true });

  const safe = (fn?: Function, ...a: any[]) => { try { fn && fn(...a); } catch { /* swallow */ } };

  es.addEventListener('INTENT_DETECTED', (e: MessageEvent) => {
    const meta = JSON.parse(e.data || '{}');
    safe(h.onIntent, meta.intent, meta);
  });
  es.addEventListener('RUN_STARTED', (e: MessageEvent) => {
    const meta = JSON.parse(e.data || '{}');
    safe(h.onStart, meta);
    if (meta.intent) safe(h.onIntent, meta.intent, meta);
  });
  es.addEventListener('TOOL_CALL_START', (e: MessageEvent) => {
    const name = JSON.parse(e.data || '{}')?.name;
    if (name) safe(h.onToolStart, name);
  });
  es.addEventListener('TOOL_CALL_END', (e: MessageEvent) => {
    const d = JSON.parse(e.data || '{}');
    safe(h.onToolEnd, d?.name, !!d?.ok, d?.error);
  });
  es.addEventListener('TEXT_MESSAGE_CONTENT', (e: MessageEvent) => {
    const text = JSON.parse(e.data || '{}')?.text ?? '';
    if (text) safe(h.onChunk, text);
  });
  es.addEventListener('RUN_FINISHED', () => {
    safe(h.onFinish);
    es.close();
  });
  es.addEventListener('SUGGESTIONS', (e: MessageEvent) => {
    try {
      const d = JSON.parse(e.data || '{}');
      if (Array.isArray(d.chips) && d.chips.length) safe(h.onSuggestions, d.chips);
    } catch { /* ignore */ }
  });
  es.onerror = (err) => { safe(h.onError, err); es.close(); };

  return () => es.close();
}
