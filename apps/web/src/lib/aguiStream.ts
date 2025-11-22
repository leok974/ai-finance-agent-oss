export type AguiHandlers = {
  onStart?(meta: { intent?: string; month?: string; ts?: number }): void;
  onIntent?(intent: string, meta: unknown): void;
  onToolStart?(name: string): void;
  onToolEnd?(name: string, ok: boolean, error?: string): void;
  onChunk?(text: string): void;
  onMeta?(meta: unknown): void;
  onFinish?(): void;
  onError?(err: unknown): void;
  onSuggestions?(chips: Array<{ label: string; action: string }>): void;
  onSuggestedActions?(actions: Array<any>): void;
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

  const safe = <T extends unknown[]>(fn: ((...args: T) => void) | undefined, ...a: T) => {
    try { fn && fn(...a); } catch { /* swallow */ }
  };

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
  es.addEventListener('META', (e: MessageEvent) => {
    try {
      const d = JSON.parse(e.data || '{}');
      safe(h.onMeta, d);
    } catch { /* ignore */ }
  });
  es.addEventListener('SUGGESTIONS', (e: MessageEvent) => {
    try {
      const d = JSON.parse(e.data || '{}');
      if (Array.isArray(d.chips) && d.chips.length) safe(h.onSuggestions, d.chips);
    } catch { /* ignore */ }
  });
  es.addEventListener('SUGGESTED_ACTIONS', (e: MessageEvent) => {
    try {
      const d = JSON.parse(e.data || '{}');
      if (Array.isArray(d.actions) && d.actions.length) safe(h.onSuggestedActions, d.actions);
    } catch { /* ignore */ }
  });
  es.onerror = (err) => { safe(h.onError, err); es.close(); };

  return () => es.close();
}
