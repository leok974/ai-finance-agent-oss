/**
 * ChatIframe.tsx - Simplified chat component for iframe context
 *
 * Uses 3-row grid layout (tools header | scrollable messages | composer)
 * to ensure nothing escapes the iframe boundaries.
 */

import * as React from 'react';
import { useChatSession } from '@/state/chatSession';
import { getInit } from './main';
import { fetchJSON } from '@/lib/http';
import {
  getToolsOpen,
  subscribe as subscribeTools,
  toggleTools,
} from '@/state/chat/toolsPanel';

const { useEffect, useRef, useState } = React;

type MsgRole = 'user' | 'assistant';
type Msg = { role: MsgRole; text: string; ts: number; meta?: any };

export function ChatIframe() {
  const listRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState('');
  const [uiMessages, setUiMessages] = useState<Msg[]>([]);
  const [showTools, setShowTools] = useState(() => getToolsOpen());
  const [busy, setBusy] = useState(false);
  const [authOk, setAuthOk] = useState(true);

  // Subscribe to toolsPanel store
  useEffect(() => {
    return subscribeTools(setShowTools);
  }, []);

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
      const data = await fetchJSON<any>('agent/chat', {
        method: 'POST',
        body: JSON.stringify({
          messages: [{ role: 'user', content: text }],
          context: { month: INIT.month }
        }),
      });

      // If request succeeds, ensure auth is marked OK
      setAuthOk(true);

      const reply =
        data.reply ??
        data.text ??
        data?.result?.text ??
        (typeof data === 'string' ? data : '');

      if (!reply) {
        console.debug('[chat] full response', data);
      }

      // Add assistant response to store
      const newState = useChatSession.getState();
      useChatSession.setState({
        messages: [...newState.messages, {
          id: crypto.randomUUID(),
          role: 'assistant',
          text: reply || '⚠️ No text returned. See console for full JSON.',
          at: Date.now(),
          meta: data.meta ?? { mode: data.mode }
        }]
      });

      console.log('[ChatIframe] received reply:', (reply || 'no text').slice(0, 80));
    } catch (err) {
      console.error('[ChatIframe] submit failed:', err);

      // Check if it's a 401 auth error
      const errMsg = String(err);
      if (errMsg.includes('401')) {
        // Set auth flag to show banner, but don't add error to chat
        setAuthOk(false);
      } else {
        // For non-auth errors, show error in chat
        const newState = useChatSession.getState();
        useChatSession.setState({
          messages: [...newState.messages, {
            id: crypto.randomUUID(),
            role: 'assistant',
            text: `⚠️ Request failed: ${String(err)}`,
            at: Date.now()
          }]
        });
      }
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

    // Map tool names to backend mode names
    const TOOL_MAP: Record<string, string> = {
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

    const mode = TOOL_MAP[tool];
    if (!mode) {
      // Unknown tool - abort with friendly message
      const newState = useChatSession.getState();
      useChatSession.setState({
        messages: [...newState.messages, {
          id: crypto.randomUUID(),
          role: 'assistant',
          text: `Tool "${tool}" isn't available yet. Try Month summary or Trends instead.`,
          at: Date.now()
        }]
      });
      setBusy(false);
      return;
    }

    setBusy(true);

    try {
      const data = await fetchJSON<any>('agent/chat', {
        method: 'POST',
        body: JSON.stringify({
          messages: [{ role: 'user', content: `Run ${tool}` }],
          context: { month: INIT.month },
          mode: mode,
          force_llm: false
        }),
      });

      const reply =
        data.reply ??
        data.text ??
        data?.result?.text ??
        (typeof data === 'string' ? data : '');

      if (!reply) {
        console.debug('[chat] tool response', data);
      }

      const newState = useChatSession.getState();
      useChatSession.setState({
        messages: [...newState.messages, {
          id: crypto.randomUUID(),
          role: 'assistant',
          text: reply || JSON.stringify(data.result ?? data, null, 2) || '⚠️ No text returned. See console for full JSON.',
          at: Date.now(),
          meta: { mode: data.mode, ...data.meta }
        }]
      });

      console.log('[ChatIframe] tool result:', (reply || 'structured data').slice(0, 80));
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

  // Render structured chart data as mini card
  const renderStructuredData = (data: any, mode?: string) => {
    if (!data || typeof data !== 'object') return null;

    // Extract key-value pairs (first level only)
    const entries = Object.entries(data)
      .filter(([k, v]) => typeof v !== 'object' || Array.isArray(v))
      .slice(0, 6); // Limit to 6 rows for readability

    if (entries.length === 0) return null;

    return (
      <div className="result-card">
        {mode && <div className="result-card-title">{mode.replace(/_/g, ' ')}</div>}
        <div className="result-card-body">
          {entries.map(([key, value]) => (
            <div key={key} className="result-row">
              <span className="result-key">{key.replace(/_/g, ' ')}:</span>
              <span className="result-value">
                {Array.isArray(value) ? value.length + ' items' : String(value)}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Group messages by date
  const messagesByDate = uiMessages.reduce((acc, msg) => {
    const date = formatDate(msg.ts);
    if (!acc[date]) acc[date] = [];
    acc[date].push(msg);
    return acc;
  }, {} as Record<string, Msg[]>);

  return (
    <div data-testid="lm-chat-iframe">
      {/* HEADER */}
      <header data-testid="lm-chat-header">
        {/* Top row: title + status + export actions */}
        <div className="lm-chat-header-top">
          <div className="lm-chat-brand">
            <span className="lm-chat-title">LedgerMind Assistant</span>
            <span className="lm-chat-status-pill">LLM: OK</span>
          </div>

          <div className="lm-chat-header-actions">
            <button
              data-testid="chat-export-json"
              onClick={() => {
                // Export logic placeholder
                console.log('[ChatIframe] Export JSON');
              }}
              className="lm-chip-with-icon"
            >
              <span className="lm-chip-icon" aria-hidden="true">
                {"{ }"}
              </span>
              <span>Export JSON</span>
            </button>

            <button
              data-testid="chat-export-markdown"
              onClick={() => {
                // Export logic placeholder
                console.log('[ChatIframe] Export Markdown');
              }}
              className="lm-chip-with-icon"
            >
              <span className="lm-chip-icon" aria-hidden="true">
                MD
              </span>
              <span>Export Markdown</span>
            </button>

            <button
              data-testid="chat-tools-toggle"
              onClick={() => toggleTools()}
              className="lm-chip-with-icon"
            >
              <span className="lm-chip-icon" aria-hidden="true">
                🛠
              </span>
              <span>{showTools ? 'Hide tools' : 'Show tools'}</span>
            </button>
          </div>
        </div>

        {/* Second row: grouped tools */}
        {showTools && (
          <div className="lm-chat-header-tools" data-testid="lm-chat-tools">
            <div className="lm-tools-group">
              <div className="lm-tools-group-label">Insights</div>
              <div className="lm-tools-chips-row">
                <button
                  data-testid="chat-tool-month-summary"
                  onClick={() => runTool('month_summary')}
                  disabled={busy}
                  className="lm-chip-with-icon"
                >
                  <span className="lm-chip-icon" aria-hidden="true">📆</span>
                  <span>Month summary</span>
                </button>

                <button
                  data-testid="chat-tool-trends"
                  onClick={() => runTool('trends')}
                  disabled={busy}
                  className="lm-chip-with-icon"
                >
                  <span className="lm-chip-icon" aria-hidden="true">📈</span>
                  <span>Trends</span>
                </button>

                <button
                  data-testid="chat-tool-alerts"
                  onClick={() => runTool('alerts')}
                  disabled={busy}
                  className="lm-chip-with-icon"
                >
                  <span className="lm-chip-icon" aria-hidden="true">⚠️</span>
                  <span>Alerts</span>
                </button>
              </div>
            </div>

            <div className="lm-tools-group">
              <div className="lm-tools-group-label">Subscriptions</div>
              <div className="lm-tools-chips-row">
                <button
                  data-testid="chat-tool-recurring"
                  onClick={() => runTool('recurring')}
                  disabled={busy}
                  className="lm-chip-with-icon"
                >
                  <span className="lm-chip-icon" aria-hidden="true">🔁</span>
                  <span>Recurring</span>
                </button>

                <button
                  data-testid="chat-tool-find-subscriptions"
                  onClick={() => runTool('find_subscriptions')}
                  disabled={busy}
                  className="lm-chip-with-icon"
                >
                  <span className="lm-chip-icon" aria-hidden="true">🔎</span>
                  <span>Find subscriptions</span>
                </button>
              </div>
            </div>

            <div className="lm-tools-group">
              <div className="lm-tools-group-label">Search & planning</div>
              <div className="lm-tools-chips-row">
                <button
                  data-testid="chat-tool-insights"
                  onClick={() => runTool('insights')}
                  disabled={busy}
                  className="lm-chip-with-icon"
                >
                  <span className="lm-chip-icon" aria-hidden="true">🧠</span>
                  <span>Insights (Q)</span>
                </button>

                <button
                  data-testid="chat-tool-budget-suggest"
                  onClick={() => runTool('budget_suggest')}
                  disabled={busy}
                  className="lm-chip-with-icon"
                >
                  <span className="lm-chip-icon" aria-hidden="true">💡</span>
                  <span>Budget suggest</span>
                </button>

                <button
                  data-testid="chat-tool-search-transactions"
                  onClick={() => runTool('search_transactions')}
                  disabled={busy}
                  className="lm-chip-with-icon"
                >
                  <span className="lm-chip-icon" aria-hidden="true">🔍</span>
                  <span>Search transactions (NL)</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* BODY */}
      <main data-testid="lm-chat-main">
        <section ref={listRef} data-testid="lm-chat-messages">
        {uiMessages.length === 0 && (
          <div className="lm-chat-greeting">
            <p className="lm-chat-greeting-title">Hey! 👋</p>
            <p className="lm-chat-greeting-body">
              Start a conversation or pick a tool from the header to explore your spending.
            </p>
          </div>
        )}

        {Object.entries(messagesByDate).map(([date, msgs]) => (
          <div key={date}>
            <div className="date-divider">
              <span>{date}</span>
            </div>

            {msgs.map((m, idx) => {
              // Try to parse text as JSON for structured data
              let structuredData = null;
              try {
                if (m.text.trim().startsWith('{')) {
                  structuredData = JSON.parse(m.text);
                }
              } catch {
                // Not JSON, render as text
              }

              return (
                <div key={idx} className={`bubble ${m.role === 'user' ? 'bubble--me' : 'bubble--ai'}`}>
                  {structuredData ? (
                    renderStructuredData(structuredData, m.meta?.mode)
                  ) : (
                    <p>{m.text}</p>
                  )}
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
              );
            })}
          </div>
        ))}
      </section>
    </main>

      {/* FOOTER */}
      <footer data-testid="lm-chat-input-wrapper">
        {!authOk && (
          <div
            data-testid="chat-auth-banner"
            style={{
              backgroundColor: 'rgb(254, 243, 199)',
              border: '1px solid rgb(251, 191, 36)',
              borderRadius: '0.375rem',
              color: 'rgb(146, 64, 14)',
              fontSize: '0.875rem',
              padding: '0.75rem',
              marginBottom: '0.75rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            <span style={{ fontSize: '1.125rem' }}>⚠️</span>
            <span>
              You're not signed in.{' '}
              <a
                href="/login"
                style={{
                  color: 'rgb(146, 64, 14)',
                  fontWeight: '600',
                  textDecoration: 'underline'
                }}
              >
                Sign in
              </a>{' '}
              to enable chat.
            </span>
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <div className="lm-chat-input-row">
            <textarea
              data-testid="chat-input"
              className="input"
              placeholder="Ask or type a command…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={busy || !authOk}
              rows={1}
            />
            <button
              data-testid="chat-send"
              type="submit"
              className="btn btn--primary"
              disabled={!draft.trim() || busy || !authOk}
            >
              {busy ? '...' : 'Send'}
            </button>
          </div>
        </form>
      </footer>
    </div>
  );
}
