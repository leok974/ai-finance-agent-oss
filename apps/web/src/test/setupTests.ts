import '@testing-library/jest-dom';

// Enhanced EventSource mock with global registry helpers
const ES_REG: any[] = [];
class MockEventSource {
  static instances = ES_REG;
  url: string;
  withCredentials: boolean;
  readyState = 0; // 0 connecting, 1 open, 2 closed
  private listeners: Record<string, Array<(e: MessageEvent) => void>> = {};

  constructor(url: string, init?: EventSourceInit) {
    this.url = url;
    this.withCredentials = !!init?.withCredentials;
    ES_REG.push(this);
    setTimeout(() => { this.readyState = 1; this._dispatch('open'); }, 0);
  }
  addEventListener(t: string, cb: (e: MessageEvent) => void) { (this.listeners[t] ||= []).push(cb); }
  removeEventListener(t: string, cb: (e: MessageEvent) => void) { this.listeners[t] = (this.listeners[t]||[]).filter(x => x!==cb); }
  close() { this.readyState = 2; }
  _emit(type: string, data?: any) {
    const e = new MessageEvent(type, { data: data != null ? JSON.stringify(data) : '' });
    (this.listeners[type] || []).forEach(cb => cb(e));
  }
  _dispatch(type: string) { const e = new MessageEvent(type); (this.listeners[type] || []).forEach(cb => cb(e)); }
}
(globalThis as any).EventSource = MockEventSource as any;
(globalThis as any).__ES_INSTANCES = ES_REG;
(globalThis as any).__ES_LAST = () => ES_REG[ES_REG.length - 1];

// Fallback fetch mock (avoid accidental real network in unit tests)
// Use top-level await style guard via immediately invoked async function
((async () => {
  try {
    if (!(globalThis as any).fetch) {
      const mod = await import('vitest');
      (globalThis as any).fetch = (mod as any).vi.fn(() => Promise.resolve(new Response('{}', { status: 200 }))) as any;
    }
  } catch (_err) { /* intentionally empty: swallow to render empty-state */ }
})());
