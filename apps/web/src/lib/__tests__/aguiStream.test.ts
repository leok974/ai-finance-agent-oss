import { describe, it, expect, vi } from 'vitest';
import { wireAguiStream } from '../aguiStream';

// Helper to fetch latest mock EventSource instance
function latestES(): any {
  const ES: any = (globalThis as any).EventSource;
  if (ES.instances && ES.instances.length) return ES.instances[ES.instances.length - 1];
  return ES.mockLast || ES;
}

describe('wireAguiStream', () => {
  it('parses RUN_STARTED, TOOL_CALL_*, TEXT_MESSAGE_CONTENT, SUGGESTIONS, RUN_FINISHED', async () => {
    const handlers = {
      onStart: vi.fn(),
      onIntent: vi.fn(),
      onToolStart: vi.fn(),
      onToolEnd: vi.fn(),
      onChunk: vi.fn(),
      onFinish: vi.fn(),
      onSuggestions: vi.fn(),
      onError: vi.fn(),
    };

    const dispose = wireAguiStream({ q: 'Show KPIs', month: '2025-08', mode: 'kpis' }, handlers as any);
    const inst = latestES();

    inst._emit('RUN_STARTED', { intent: 'kpis', month: '2025-08' });
    inst._emit('TOOL_CALL_START', { name: 'analytics.kpis' });
    inst._emit('TOOL_CALL_END', { name: 'analytics.kpis', ok: true });
    inst._emit('TEXT_MESSAGE_CONTENT', { text: 'KPI summary...' });
    inst._emit('SUGGESTIONS', { chips: [{ label: 'Compare vs last month', action: 'compare_prev' }] });
    inst._emit('RUN_FINISHED', { ts: Date.now() });

    expect(handlers.onStart).toHaveBeenCalledWith(expect.objectContaining({ intent: 'kpis' }));
  // onIntent passes (intent, meta)
  expect(handlers.onIntent).toHaveBeenCalledWith('kpis', expect.objectContaining({ intent: 'kpis' }));
    expect(handlers.onToolStart).toHaveBeenCalledWith('analytics.kpis');
    expect(handlers.onToolEnd).toHaveBeenCalledWith('analytics.kpis', true, undefined);
    expect(handlers.onChunk).toHaveBeenCalledWith('KPI summary...');
    expect(handlers.onSuggestions).toHaveBeenCalledWith([
      { label: 'Compare vs last month', action: 'compare_prev' }
    ]);
    expect(handlers.onFinish).toHaveBeenCalled();

    dispose();
  });
});
