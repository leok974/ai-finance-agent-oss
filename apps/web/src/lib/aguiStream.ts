import { CHAT_STREAMING_ENABLED } from "./streaming-config";
import { useChatSession } from "@/state/chatSession";

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
  // NEW: optional message ID for streaming to store
  streamingMessageId?: string;
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

  // Get streaming store actions if feature is enabled and message ID provided
  let streamingActions: ReturnType<typeof useChatSession.getState> | null = null;
  if (CHAT_STREAMING_ENABLED && h.streamingMessageId) {
    try {
      streamingActions = useChatSession.getState();
    } catch {
      // Store may not be available
    }
  }

  es.addEventListener('INTENT_DETECTED', (e: MessageEvent) => {
    const meta = JSON.parse(e.data || '{}');
    safe(h.onIntent, meta.intent, meta);
  });
  es.addEventListener('RUN_STARTED', (e: MessageEvent) => {
    const meta = JSON.parse(e.data || '{}');
    safe(h.onStart, meta);
    if (meta.intent) safe(h.onIntent, meta.intent, meta);

    // NEW: Start streaming if enabled
    if (streamingActions && h.streamingMessageId) {
      streamingActions.startStreamingMessage(h.streamingMessageId);
    }
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
    if (text) {
      safe(h.onChunk, text);

      // NEW: Append to streaming message if enabled
      if (streamingActions && h.streamingMessageId) {
        streamingActions.appendToMessage(h.streamingMessageId, text);
      }
    }
  });
  es.addEventListener('RUN_FINISHED', () => {
    safe(h.onFinish);

    // NEW: Finish streaming if enabled
    if (streamingActions && h.streamingMessageId) {
      streamingActions.finishStreamingMessage(h.streamingMessageId);
    }

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
  es.onerror = (err) => {
    safe(h.onError, err);

    // NEW: Finish streaming on error if enabled
    if (streamingActions && h.streamingMessageId) {
      streamingActions.finishStreamingMessage(h.streamingMessageId);
    }

    es.close();
  };

  return () => es.close();
}
