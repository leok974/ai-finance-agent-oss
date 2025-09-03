import React, { useCallback, useEffect, useRef, useState } from "react";
import { agentStatus, agentChat } from "../lib/api";

type Msg = { role: "user" | "assistant" | "system"; content: string };

const ChatDock: React.FC = () => {
  const [open, setOpen] = useState<boolean>(() => {
    const v = localStorage.getItem("chatdock_open");
    return v ? v === "1" : true;
  });
  const [ready, setReady] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    localStorage.setItem("chatdock_open", open ? "1" : "0");
  }, [open]);

  useEffect(() => {
    async function ping() {
      try {
        const r = await agentStatus();
        if (r?.pong || r?.status === "ok") setReady(true);
      } catch { /* leave ready=false */ }
    }
    ping();
  }, []);

  useEffect(() => {
    // autoscroll
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [msgs, open]);

  const send = useCallback(async () => {
    if (!input.trim() || busy) return;
    const q = input.trim();
    setInput("");
    const nextMsgs = [...msgs, { role: "user" as const, content: q }];
    setMsgs(nextMsgs);
    setBusy(true);
    try {
      const apiMsgs = nextMsgs.map((m) => ({ role: m.role, content: m.content }));
      const r = await agentChat(apiMsgs, {
        system: "You are Finance Agent OSS. Be concise and helpful.",
      });
      const text =
        r?.reply ??
        r?.content ??
        (typeof r === "string" ? r : JSON.stringify(r));
      setMsgs((xs) => [...xs, { role: "assistant", content: text }]);
    } catch (e: any) {
      setMsgs((xs) => [
        ...xs,
        { role: "system", content: `⚠️ Chat failed: ${e?.message ?? e}` },
      ]);
    } finally {
      setBusy(false);
    }
  }, [input, busy, msgs]);

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-4 left-4 z-[70] rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-lg hover:bg-indigo-500"
      >
        {open ? "Close Chat" : "Finance Chat"}
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed bottom-20 left-4 z-[70] w-[360px] max-w-[92vw] rounded-2xl border border-gray-700 bg-gray-900/90 backdrop-blur shadow-2xl">
          <div className="flex items-center justify-between px-3 py-2">
            <div className="text-sm font-semibold text-gray-100">Finance Chat</div>
            <div className={`text-xs ${ready ? "text-emerald-300" : "text-gray-400"}`}>
              {ready ? "online" : "offline"}
            </div>
          </div>
          <div
            ref={scrollRef}
            className="mx-3 h-64 overflow-auto rounded-xl bg-black/20 p-2 text-sm"
          >
            {msgs.length === 0 && (
              <div className="text-gray-400">
                Ask about months, categories, anomalies… e.g. “What changed from Oct to Dec?”
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className="mb-2">
                <span
                  className={`mr-2 rounded px-1.5 py-0.5 text-[11px] ${
                    m.role === "user"
                      ? "bg-indigo-600/70 text-white"
                      : m.role === "assistant"
                      ? "bg-emerald-600/70 text-white"
                      : "bg-gray-600/70 text-gray-100"
                  }`}
                >
                  {m.role}
                </span>
                <span className="whitespace-pre-wrap text-gray-100">{m.content}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 p-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder={ready ? "Type your question…" : "Agent offline…"}
              disabled={!ready || busy}
              className="flex-1 rounded-xl border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <button
              onClick={send}
              disabled={!ready || busy || !input.trim()}
              className={`rounded-xl px-3 py-2 text-sm font-medium ${
                !ready || busy || !input.trim()
                  ? "cursor-not-allowed bg-gray-800 text-gray-500"
                  : "bg-indigo-600 text-white hover:bg-indigo-500"
              }`}
            >
              {busy ? "…" : "Send"}
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default ChatDock;
