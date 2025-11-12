/**
 * ChatIframe.tsx - Simplified chat component for iframe context
 *
 * Uses 3-row grid layout (tools header | scrollable messages | composer)
 * to ensure nothing escapes the iframe boundaries.
 */

import * as React from 'react';
import { useChatSession } from '@/state/chatSession';
import { getInit } from './main';

const { useEffect, useRef, useState } = React;

type MsgRole = 'user' | 'assistant';
type Msg = { role: MsgRole; text: string; ts: number; meta?: any };

export function ChatIframe() {
  const listRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState('');
  const [uiMessages, setUiMessages] = useState<Msg[]>([]);
  const [showTools, setShowTools] = useState(true);
  const [busy, setBusy] = useState(false);

  // 🔥 Deferred subscription to Zustand store (prevents infinite render loop)
  const [chatState, setChatState] = useState(() => {
    const state = useChatSession.getState();
    return {
      version: state.version,
      messages: state.messages,
      sessionId: state.sessionId
    };
  });

  useEffect(() => {
    const unsub = useChatSession.subscribe((state) => {
      setChatState({
        version: state.version,
        messages: state.messages,
        sessionId: state.sessionId
      });
    });
    return unsub;
  }, []);

  const { messages: storeMessages } = chatState;

  // Sync uiMessages from store messages
  useEffect(() => {
    if (!storeMessages || !Array.isArray(storeMessages)) return;

    const mapped: Msg[] = storeMessages.map((m: any) => ({
      role: (m.role === 'assistant' ? 'assistant' : 'user') as MsgRole,
      text: String(m.text || m.content || ''),
      ts: Number(m.at || m.ts || m.createdAt) || Date.now(),
      meta: m.meta
    }));

    setUiMessages(mapped);
    console.log('[ChatIframe] synced messages from store:', mapped.length);
  }, [storeMessages]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;

    // Scroll to bottom with smooth animation
    const lastBubble = el.querySelector('.bubble:last-of-type');
    if (lastBubble) {
      lastBubble.scrollIntoView({ block: 'end', behavior: 'smooth' });
    } else {
      // Fallback: scroll container to bottom
      el.scrollTop = el.scrollHeight;
    }
  }, [uiMessages.length]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim() || busy) return;

    const INIT = getInit();
    if (!INIT) {
      console.warn('[ChatIframe] no INIT config, cannot submit');
      return;
    }

    const text = draft.trim();
    const ts = Date.now();
    const state = useChatSession.getState();

    // Add user message to store
    useChatSession.setState({
      messages: [...state.messages, {
        id: crypto.randomUUID(),
        role: 'user',
        text,
        at: ts
      }]
    });

    setDraft('');
    setBusy(true);

    try {
      const res = await fetch(`${INIT.apiBase}/agent/chat`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: text }],
          context: { month: INIT.month }
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      const reply = data.reply ?? data.result?.text ?? data.text ?? '(no reply)';

      // Add assistant response to store
      const newState = useChatSession.getState();
      useChatSession.setState({
        messages: [...newState.messages, {
          id: crypto.randomUUID(),
          role: 'assistant',
          text: reply,
          at: Date.now(),
          meta: data.meta ?? { mode: data.mode }
        }]
      });

      console.log('[ChatIframe] received reply:', reply.slice(0, 80));
    } catch (err) {
      console.error('[ChatIframe] submit failed:', err);

      const newState = useChatSession.getState();
      useChatSession.setState({
        messages: [...newState.messages, {
          id: crypto.randomUUID(),
          role: 'assistant',
          text: `⚠️ Request failed: ${String(err)}`,
          at: Date.now()
        }]
      });
    } finally {
      setBusy(false);
    }
  };

  // Tool execution handler
  const runTool = async (tool: string, args: Record<string, any> = {}) => {
    const INIT = getInit();
    if (!INIT) {
      console.warn('[ChatIframe] no INIT config, cannot run tool');
      return;
    }

    if (busy) return;

    const state = useChatSession.getState();

    // Add user message showing tool invocation
    useChatSession.setState({
      messages: [...state.messages, {
        id: crypto.randomUUID(),
        role: 'user',
        text: `/${tool}`,
        at: Date.now()
      }]
    });

    setBusy(true);

    try {
      // Map tool names to backend mode names
      const modeMap: Record<string, string> = {
        'month_summary': 'charts.month_summary',
        'trends': 'charts.month_trends',
        'alerts': 'charts.month_alerts',
        'recurring': 'charts.recurring',
        'subscriptions': 'charts.subscriptions',
        'find_subscriptions': 'find_subscriptions',
        'insights': 'insights',
        'kpis': 'kpis',
        'budget_suggest': 'budget_suggest',
        'search_transactions': 'nl_txns',
      };

      const mode = modeMap[tool] || tool;

      const res = await fetch(`${INIT.apiBase}/agent/chat`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: `Run ${tool}` }],
          context: { month: INIT.month },
          mode: mode,
          force_llm: false
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      const reply = data.reply ?? data.result?.text ?? data.text ?? JSON.stringify(data.result ?? data, null, 2);

      const newState = useChatSession.getState();
      useChatSession.setState({
        messages: [...newState.messages, {
          id: crypto.randomUUID(),
          role: 'assistant',
          text: reply,
          at: Date.now(),
          meta: { mode: data.mode, ...data.meta }
        }]
      });

      console.log('[ChatIframe] tool result:', reply.slice(0, 80));
    } catch (err) {
      console.error('[ChatIframe] tool failed:', err);

      const newState = useChatSession.getState();
      useChatSession.setState({
        messages: [...newState.messages, {
          id: crypto.randomUUID(),
          role: 'assistant',
          text: `⚠️ Tool failed: ${String(err)}`,
          at: Date.now()
        }]
      });
    } finally {
      setBusy(false);
    }
  };

  // Format date for dividers
  const formatDate = (ts: number) => {
    const d = new Date(ts);
    return d.toISOString().split('T')[0];
  };

  // Group messages by date
  const messagesByDate = uiMessages.reduce((acc, msg) => {
    const date = formatDate(msg.ts);
    if (!acc[date]) acc[date] = [];
    acc[date].push(msg);
    return acc;
  }, {} as Record<string, Msg[]>);

  return (
    <div className="lm-iframe">
      {/* Tools header (row 1) - sticky with horizontal scroll */}
      {showTools && (
        <header className="lm-tools-area">
          <div className="lm-tools-row">
            <button className="chip" disabled={busy} onClick={() => runTool('month_summary')}>Month summary</button>
            <button className="chip" disabled={busy} onClick={() => runTool('trends')}>Trends</button>
            <button className="chip" disabled={busy} onClick={() => runTool('alerts')}>Alerts</button>
            <button className="chip" disabled={busy} onClick={() => runTool('recurring')}>Recurring</button>
            <button className="chip" disabled={busy} onClick={() => runTool('subscriptions')}>Subscriptions</button>
            <div className="chip chip--ghost" />
            <button className="chip" disabled={busy} onClick={() => runTool('find_subscriptions')}>Find subscriptions</button>
            <button className="chip" disabled={busy} onClick={() => runTool('insights')}>Insights (C)</button>
            <button className="chip" disabled={busy} onClick={() => runTool('kpis')}>KPIs</button>
            <button className="chip" disabled={busy} onClick={() => runTool('budget_suggest')}>Budget suggest</button>
            <button className="chip" disabled={busy} onClick={() => runTool('search_transactions')}>Search transactions (NL)</button>
          </div>

          <div className="lm-toolsbar">
            <span className="badge badge--ok">LLM: OK</span>
            <button className="btn btn--ghost">Export JSON</button>
            <button className="btn btn--ghost">Export Markdown</button>
            <button className="btn btn--ghost">History</button>
            <button className="btn btn--ghost">Reset</button>
            <button className="btn btn--ghost">Clear</button>
            <button className="btn btn--ghost" onClick={() => setShowTools(false)}>Hide tools</button>
          </div>
        </header>
      )}

      {/* Scrollable messages (row 2) */}
      <main className="lm-thread" ref={listRef}>
        {uiMessages.length === 0 && (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--lm-muted)' }}>
            <p>Hey! 👋</p>
            <p style={{ marginTop: '0.5rem', fontSize: '14px' }}>
              Start a conversation or use the tools above.
            </p>
          </div>
        )}

        {Object.entries(messagesByDate).map(([date, msgs]) => (
          <div key={date}>
            <div className="date-divider">
              <span>{date}</span>
            </div>

            {msgs.map((m, idx) => (
              <div key={idx} className={`bubble ${m.role === 'user' ? 'bubble--me' : 'bubble--ai'}`}>
                <p>{m.text}</p>
                {m.meta && Object.keys(m.meta).length > 0 && (
                  <div className="meta">
                    {m.meta.mode && (
                      <span className={`pill ${m.meta.mode === 'finance_quick_recap' ? 'pill--accent' : ''}`}>
                        {m.meta.mode.replace(/_/g, ' ')}
                      </span>
                    )}
                    {m.meta.ctxMonth && (
                      <span className="pill">month {m.meta.ctxMonth}</span>
                    )}
                    {m.meta.model && (
                      <span className="pill">{m.meta.model}</span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </main>

      {/* Composer (row 3) */}
      <footer className="lm-composer">
        <form onSubmit={handleSubmit} style={{ display: 'contents' }}>
          <input
            className="input"
            placeholder="Ask or type a command…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={busy}
          />
          <button
            type="submit"
            className="btn btn--primary"
            disabled={!draft.trim() || busy}
          >
            {busy ? '...' : 'Send'}
          </button>
        </form>
      </footer>
    </div>
  );
}
