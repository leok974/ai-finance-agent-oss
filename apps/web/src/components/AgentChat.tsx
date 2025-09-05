import React from "react";
import { agentChat, type AgentChatRequest, type AgentChatResponse, type ChatMessage } from "../lib/api";

interface ExtendedMessage extends ChatMessage {
  meta?: {
    citations?: { type: string; id?: string; count?: number }[];
    ctxMonth?: string;
    trace?: any[];
    model?: string;
  };
}

export default function AgentChat() {
  const [messages, setMessages] = React.useState<ExtendedMessage[]>([
    { role: "system", content: "You are a finance agent." },
  ]);
  const [input, setInput] = React.useState("");
  const [loading, setLoading] = React.useState(false);

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
        model: 'gpt-oss:20b'
      };
      
      const resp: AgentChatResponse = await agentChat(req);
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
      <div className="space-y-2 max-h-64 overflow-auto text-sm">
        {messages.filter(m => m.role !== "system").map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : ""}>
            <div className={`inline-block px-3 py-2 rounded-2xl ${m.role === "user" ? "bg-blue-600" : "bg-neutral-800"}`}>
              <div>{m.content}</div>
              {/* Render assistant message with light metadata (citations + trace collapsed) */}
              {m.role === "assistant" && m.meta?.citations?.length ? (
                <div className="mt-2 text-xs opacity-70">
                  Used data: {m.meta.citations.map((c: any) =>
                    c.count ? `${c.type} ${c.count}` : `${c.type}`).join(' · ')}
                  {m.meta.ctxMonth ? ` · month ${m.meta.ctxMonth}` : ''}
                  {m.meta.model ? ` · ${m.meta.model}` : ''}
                  {m.meta.trace?.length ? (
                    <details className="mt-1">
                      <summary className="cursor-pointer hover:text-neutral-300">Trace</summary>
                      <pre className="whitespace-pre-wrap text-[10px] mt-1 p-2 bg-neutral-900 rounded overflow-auto max-h-32">
                        {JSON.stringify(m.meta.trace, null, 2)}
                      </pre>
                    </details>
                  ) : null}
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
