import React from "react";
import { agentChat, getAgentModels, type AgentChatRequest, type AgentChatResponse, type AgentModelsResponse, type ChatMessage, txnsQueryCsv, applyBudgets, downloadReportPdf, type Anomaly, clearTempBudget, unignoreAnomaly } from "../lib/api";
import { emitToastSuccess } from "@/lib/toast-helpers";
import { t } from '@/lib/i18n';

interface ExtendedMessage extends ChatMessage {
  meta?: {
    citations?: { type: string; id?: string; count?: number }[];
    ctxMonth?: string;
    trace?: any[];
    model?: string;
    mode?: string;
    filters?: Record<string, any> | undefined;
    q?: string;        // original NL query text
    intent?: string;   // nl_txns intent (e.g., list)
  // insights.anomalies payload (inline render)
  anomalies?: Anomaly[];
  anomaliesMonth?: string | null;
  };
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function modeLabel(mode?: string) {
  if (!mode) return undefined;
  if (mode === 'nl_txns') return 'Transactions';
  if (mode.startsWith('charts.')) return 'Charts';
  if (mode.startsWith('insights.')) return 'Insights';
  if (mode === 'report.link') return 'Report';
  if (mode === 'budgets.read' || mode === 'budgets.recommendations') return 'Budgets';
  return undefined;
}

export default function AgentChat() {
  const [messages, setMessages] = React.useState<ExtendedMessage[]>([
    { role: "system", content: "You are a finance agent." },
  ]);
  const [input, setInput] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [advancedOpen, setAdvancedOpen] = React.useState(false);
  const [modelsInfo, setModelsInfo] = React.useState<AgentModelsResponse | null>(null);
  const [selectedModel, setSelectedModel] = React.useState<string>(""); // empty => use server default

  // add state to track a single in-flight action
  const [busyAction, setBusyAction] = React.useState<string | null>(null);

  // tiny helper to run an async action with auto-disable + error logging
  async function runAction(key: string, fn: () => Promise<void>) {
    if (busyAction) return; // prevent parallel runs; switch to a Set for multi if desired
    setBusyAction(key);
    try {
      await fn();
    } catch (e: any) {
      // keep this no-op (console) so callers can decide how to display errors
      console.error(e);
    } finally {
      setBusyAction(null);
    }
  }

  // Persist selected model per tab session
  React.useEffect(() => {
    const saved = sessionStorage.getItem('fa.model');
    if (saved) setSelectedModel(saved);
  }, []);
  React.useEffect(() => {
    if (selectedModel) sessionStorage.setItem('fa.model', selectedModel);
    else sessionStorage.removeItem('fa.model');
  }, [selectedModel]);

  React.useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const info = await getAgentModels();
        if (!ignore) setModelsInfo(info);
      } catch {
        // ignore fetch errors; UI will just hide advanced section
      }
    })();
    return () => { ignore = true; };
  }, []);

  async function send() {
    if (!input.trim() || loading) return;
    const userMsg: ExtendedMessage = { role: "user", content: input };
    const next: ExtendedMessage[] = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setLoading(true);
    
    try {
      const req: AgentChatRequest = {
        messages: next.filter(m => m.role !== "system").map(m => ({
          role: m.role,
          content: m.content
        })),
        // no context on purpose — server will auto-enrich (month, rules, alerts, etc.)
        intent: 'general',
      };
      if (selectedModel) {
        (req as any).model = selectedModel;
      }
      
      const resp: AgentChatResponse = await agentChat(req);
      if ((resp as any).mode === "nl_txns") {
        const lastUser = next.slice().reverse().find(m => m.role === 'user');
        const mode = (resp as any).mode as string;
        const filters = (resp as any).nlq || (resp as any).filters;
        const intent = (resp as any)?.result?.intent || (resp as any)?.nlq?.intent;
        // Grounded NL transactions branch: show compact badge + summary
        const msg1: ExtendedMessage = {
          role: "assistant",
          content: ((resp as any).message || resp.rephrased?.trim() || resp.summary || resp.reply),
          meta: {
            citations: resp.citations,
            ctxMonth: resp.used_context?.month,
            trace: resp.tool_trace,
            model: resp.model,
            mode,
            filters,
            q: lastUser?.content,
            intent,
          },
        };
        // Append optional details block
        const msg2: ExtendedMessage = {
          role: "assistant",
          content: `Details:\n\n${resp.reply}`,
        };
        setMessages([...next, msg1, msg2]);
      } else {
        const mode = (resp as any).mode as string | undefined;
        // Special: inline anomalies rendering
        if (mode === 'insights.anomalies') {
          const result = (resp as any)?.result || {};
          const anomalies: Anomaly[] = Array.isArray(result?.anomalies) ? result.anomalies : [];
          const anomaliesMonth: string | null = (result?.month as string | undefined) ?? (resp as any)?.used_context?.month ?? null;
          const groundedMsg: ExtendedMessage = {
            role: "assistant",
            content: ((resp as any).message || resp.reply || 'Unusual spending categories detected.'),
            meta: {
              citations: resp.citations,
              ctxMonth: resp.used_context?.month,
              trace: resp.tool_trace,
              model: resp.model,
              mode,
              filters: (resp as any).filters,
              anomalies,
              anomaliesMonth,
            }
          };
          setMessages([...next, groundedMsg]);
  } else if (mode && ["charts.summary","charts.flows","charts.merchants","charts.categories","charts.category","report.link","budgets.read","budgets.recommendations","budgets.temp","insights.anomalies.ignore"].includes(mode)) {
          const groundedMsg: ExtendedMessage = {
            role: "assistant",
            content: ((resp as any).message || resp.reply),
            meta: {
              citations: resp.citations,
              ctxMonth: resp.used_context?.month,
              trace: resp.tool_trace,
              model: resp.model,
              mode,
              filters: (resp as any).filters,
            }
          };
          setMessages([...next, groundedMsg]);
        } else {
        const assistantMsg: ExtendedMessage = {
          role: "assistant",
          content: resp.reply,
          meta: {
            citations: resp.citations,
            ctxMonth: resp.used_context?.month,
            trace: resp.tool_trace,
            model: resp.model
          }
        };
        setMessages([...next, assistantMsg]);
        }
      }
    } catch (e: any) {
      const errorMsg: ExtendedMessage = {
        role: "assistant",
        content: `(Error) ${e?.message ?? e}`
      };
      setMessages([...next, errorMsg]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-neutral-700 p-3 bg-neutral-900 text-neutral-100">
      {modelsInfo ? (
        <div className="mb-2">
          <button
            className="text-xs text-neutral-400 hover:text-neutral-200"
            onClick={() => setAdvancedOpen(v => !v)}
          >
            {advancedOpen ? "Hide advanced" : "Show advanced"}
          </button>
          {advancedOpen && (
            <div className="mt-2 p-2 rounded-lg border border-neutral-800 bg-neutral-800/50">
              <div className="flex items-center gap-3">
                <div className="text-xs text-neutral-400">
                  Provider: <span className="text-neutral-200">{modelsInfo.provider}</span>
                  {modelsInfo.default ? (
                    <>
                      <span className="mx-2">·</span>
                      Default: <span className="text-neutral-200">{modelsInfo.default}</span>
                    </>
                  ) : null}
                </div>
                <div className="ml-auto" />
                <select
                  className="px-2 py-1 text-sm rounded-md bg-neutral-800 border border-neutral-700 text-neutral-100"
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                >
                  <option value="">Use default</option>
                  {modelsInfo.models?.map(m => (
                    <option key={m.id} value={m.id}>{m.id}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
      ) : null}
      <div className="space-y-2 max-h-64 overflow-auto text-sm">
        {messages.filter(m => m.role !== "system").map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : ""}>
            <div className={`inline-block px-3 py-2 rounded-2xl ${m.role === "user" ? "bg-blue-600" : "bg-neutral-800"}`}>
              <div className="flex items-center gap-2">
                <div>{m.content}</div>
                {m.role === "assistant" && m.meta?.mode ? (
                  <>
                    <span className="ml-2 chat-badge-grounded text-[10px] px-2 py-0.5 rounded-full" title="This reply is grounded in data">grounded</span>
                    {modeLabel(m.meta.mode) ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-neutral-900 border border-neutral-700" title={`Tool: ${m.meta.mode}`}>{modeLabel(m.meta.mode)}</span>
                    ) : null}
                  </>
                ) : null}
              </div>
              {/* Render assistant message with light metadata, filters, and actions */}
              {m.role === "assistant" && (m.meta?.citations?.length || m.meta?.filters) ? (
                <div className="mt-2 text-xs opacity-70">
                  {m.meta?.citations?.length ? (
                    <>
                      Used data: {m.meta.citations.map((c: any) => c.count ? `${c.type} ${c.count}` : `${c.type}`).join(' · ')}
                      {m.meta.ctxMonth ? ` · month ${m.meta.ctxMonth}` : ''}
                      {m.meta.model ? ` · ${m.meta.model}` : ''}
                    </>
                  ) : null}
                  {m.meta?.filters ? (
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      {['month','start','end','window','flow'].filter(k => k in (m.meta!.filters||{})).map((k) => (
                        <span key={k} className="px-2 py-0.5 rounded-full bg-neutral-900 border border-neutral-700">
                          {k}: {String((m.meta!.filters as any)[k])}
                        </span>
                      ))}
                      {Object.entries(m.meta.filters).filter(([k]) => !['month','start','end','window','flow'].includes(k)).map(([k, v]) => (
                        <span key={k} className="px-2 py-0.5 rounded-full bg-neutral-900 border border-neutral-700">
                          {k}: {String(v)}
                        </span>
                      ))}
                      {m.meta?.mode === 'insights.anomalies' ? (
                        <button
                          className="ml-2 text-[11px] px-2 py-0.5 rounded-md border border-neutral-700 hover:bg-neutral-900"
                          title="Open Insights"
                          onClick={() => {
                            try {
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            } catch (_err) { /* intentionally empty: swallow to render empty-state */ }
                          }}
                        >
                          Open Insights
                        </button>
                      ) : null}
                      {m.meta?.mode === 'nl_txns' && m.meta.intent === 'list' && m.meta.q ? (
                        <button
                          className="ml-2 text-[11px] px-2 py-0.5 rounded-md bg-white text-black hover:opacity-90"
                          title="Download CSV of these results"
                          onClick={async () => {
                            try {
                              const { blob, filename } = await txnsQueryCsv(m.meta!.q!, {
                                start: (m.meta!.filters as any)?.start,
                                end: (m.meta!.filters as any)?.end,
                                page_size: Math.max(100, Math.min(1000, (m.meta!.filters as any)?.page_size || (m.meta!.filters as any)?.limit || 200)),
                                ...(m.meta!.filters as any)?.flow ? { flow: (m.meta!.filters as any)?.flow } : {},
                              });
                              saveBlob(blob, filename || 'txns_query.csv');
                            } catch (err: any) {
                              alert(`CSV export failed: ${err?.message || String(err)}`);
                            }
                          }}
                        >
                          Download CSV
                        </button>
                      ) : null}
                      {m.meta?.mode === 'charts.category' && (m.meta.filters as any)?.category ? (
                        (() => {
                          const cat = String((m.meta!.filters as any).category);
                          const months = Number((m.meta!.filters as any).months ?? 6);
                          const actionKey = `charts.category:${cat}`;
                          const label = busyAction === actionKey ? 'Opening…' : 'Open full chart';
                          const disabled = !!busyAction && busyAction !== actionKey;
                          return (
                            <button
                              className="ml-2 text-[11px] px-2 py-0.5 rounded-md border border-neutral-700 hover:bg-neutral-900 disabled:opacity-60"
                              title="Open full chart"
                              disabled={disabled}
                              onClick={() => runAction(actionKey, async () => {
                                window.dispatchEvent(new CustomEvent('open-category-chart', { detail: { category: cat, months } }));
                              })}
                            >
                              {label}
                            </button>
                          );
                        })()
                      ) : null}
                      {m.meta?.mode === 'budgets.temp' && (m.meta.filters as any)?.category ? (
                        (() => {
                          const cat = String((m.meta!.filters as any).category);
                          const month = (m.meta!.filters as any)?.month as string | undefined;
                          const actionKey = `budgets.temp.undo:${cat}`;
                          const label = busyAction === actionKey ? 'Undoing…' : 'Undo temp budget';
                          const disabled = !!busyAction && busyAction !== actionKey;
                          return (
                            <button
                              className="ml-2 text-[11px] px-2 py-0.5 rounded-md border border-neutral-700 hover:bg-neutral-900 disabled:opacity-60"
                              title="Undo temp budget"
                              disabled={disabled}
                              onClick={() => runAction(actionKey, async () => {
                                const r = await clearTempBudget(cat, month);
                                const amt = r?.deleted?.amount ?? 0;
                                emitToastSuccess(t('ui.toast.temp_budget_removed_title'), { description: `${cat}${amt ? ` ($${Number(amt).toFixed(2)})` : ''}` });
                              })}
                            >
                              {label}
                            </button>
                          );
                        })()
                      ) : null}
                      {m.meta?.mode === 'insights.anomalies.ignore' && (m.meta.filters as any)?.category ? (
                        (() => {
                          const cat = String((m.meta!.filters as any).category);
                          const actionKey = `anomalies.unignore:${cat}`;
                          const label = busyAction === actionKey ? 'Reinstating…' : 'Undo ignore';
                          const disabled = !!busyAction && busyAction !== actionKey;
                          return (
                            <button
                              className="ml-2 text-[11px] px-2 py-0.5 rounded-md border border-neutral-700 hover:bg-neutral-900 disabled:opacity-60"
                              title="Undo ignore"
                              disabled={disabled}
                              onClick={() => runAction(actionKey, async () => {
                                await unignoreAnomaly(cat);
                                emitToastSuccess(t('ui.toast.anomaly_unignored_title'), { description: cat });
                              })}
                            >
                              {label}
                            </button>
                          );
                        })()
                      ) : null}
                      {m.meta?.mode === 'budgets.recommendations' ? (
                        <>
                          <button
                            className="ml-2 text-[11px] px-2 py-0.5 rounded-md bg-white text-black hover:opacity-90"
                            title="Apply budgets (median)"
                            onClick={async () => {
                              try {
                                await applyBudgets({ strategy: 'median' });
                                alert('Applied budgets (median).');
                              } catch (err: any) {
                                alert(`Apply budgets failed: ${err?.message || String(err)}`);
                              }
                            }}
                          >
                            Apply budgets
                          </button>
                          <button
                            className="ml-2 text-[11px] px-2 py-0.5 rounded-md border border-neutral-700 hover:bg-neutral-900"
                            title="Export PDF report"
                            onClick={async () => {
                              try {
                                const { blob, filename } = await downloadReportPdf();
                                saveBlob(blob, filename || 'finance_report.pdf');
                              } catch (err: any) {
                                alert(`PDF export failed: ${err?.message || String(err)}`);
                              }
                            }}
                          >
                            Export PDF
                          </button>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                  {m.meta?.trace?.length ? (
                    <details className="mt-1">
                      <summary className="cursor-pointer hover:text-neutral-300">Trace</summary>
                      <pre className="whitespace-pre-wrap text-[10px] mt-1 p-2 bg-neutral-900 rounded overflow-auto max-h-32">
                        {JSON.stringify(m.meta.trace, null, 2)}
                      </pre>
                    </details>
                  ) : null}
                </div>
              ) : null}
              {/* Inline renderer for anomalies result */}
              {m.role === 'assistant' && m.meta?.mode === 'insights.anomalies' && (m.meta?.anomalies?.length ?? 0) > 0 ? (
                <div className="mt-2 text-xs">
                  {m.meta?.anomaliesMonth ? (
                    <div className="mb-1 opacity-70">{m.meta.anomaliesMonth}</div>
                  ) : null}
                  <ul className="space-y-1">
                    {m.meta.anomalies!.map((a) => {
                      const pct = Math.round((a as any).pct_from_median * 100);
                      const badge = (a as any).direction === 'high' ? 'bg-yellow-500/20' : 'bg-cyan-500/20';
                      return (
                        <li key={(a as any).category} className="flex items-center justify-between border-t border-neutral-700/50 py-1 first:border-t-0">
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${badge}`}>
                              {(a as any).direction === 'high' ? 'High' : 'Low'}
                            </span>
                            <span className="font-medium">{(a as any).category}</span>
                          </div>
                          <div className="opacity-80">
                            ${Number((a as any).current).toFixed(2)} <span className="opacity-60">vs</span> ${Number((a as any).median).toFixed(2)}
                            <span className="ml-2">{pct > 0 ? `+${pct}%` : `${pct}%`}</span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <input
          className="flex-1 px-3 py-2 rounded-xl bg-neutral-800 border border-neutral-700"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Ask the agent…"
        />
        <button
          className="px-4 py-2 rounded-xl bg-white text-black disabled:opacity-50"
          onClick={send}
          disabled={loading}
        >
          {loading ? "…" : "Send"}
        </button>
      </div>
    </div>
  );
}
