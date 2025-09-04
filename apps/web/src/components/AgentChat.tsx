import React from "react";
import { agentChat, type ChatMessage } from "../lib/api";

export default function AgentChat() {
  const [messages, setMessages] = React.useState<ChatMessage[]>([
    { role: "system", content: "You are a finance agent." },
  ]);
  const [input, setInput] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  async function send() {
    if (!input.trim() || loading) return;
  const next: ChatMessage[] = [...messages, { role: "user", content: input }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const res: any = await agentChat(next);
      let reply: ChatMessage | null = null;
      if (res?.message && typeof res.message?.content === "string") {
        reply = { role: "assistant", content: res.message.content };
      } else if (typeof res?.reply === "string") {
        reply = { role: "assistant", content: res.reply };
      }
      setMessages([...next, (reply ?? { role: "assistant", content: "(no reply)" })]);
    } catch (e: any) {
  setMessages([...next, { role: "assistant", content: String(e?.message || e) }]);
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
              {m.content}
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
