import { create } from "zustand";
import { persist } from "zustand/middleware";
import { chatStore } from "@/utils/chatStore";

type Msg = { id: string; role: "user" | "assistant"; text: string; at: number; meta?: Record<string, any> };

type ChatState = {
  sessionId: string;
  messages: Msg[];
  isBusy: boolean;
  version: number; // Force re-render key
  clearedAt?: number; // Timestamp of last clear action
  clearChat: () => void; // Synchronous now
  resetSession: () => Promise<void>;
};

const newSession = () => crypto.randomUUID();

const STORAGE_KEY = "lm:chat";

// Instance ID to prevent echo loops in BroadcastChannel
const INSTANCE_ID = Math.random().toString(36).slice(2);

export const useChatSession = create<ChatState>()(
  persist(
    (set, get) => ({
      sessionId: newSession(),
      messages: [],
      isBusy: false,
      version: 0,

      clearChat: () => {
        const sid = get().sessionId;

        // 1) Wipe persistence first
        try {
          localStorage.removeItem(`lm:chat:${sid}`);
          localStorage.removeItem(STORAGE_KEY);
        } catch (err) {
          // Silently fail - storage may not be available
        }

        // 2) Also clear the legacy chatStore for backward compatibility
        chatStore.clear();

        // 3) Broadcast to other tabs BEFORE state update (tagged with origin)
        try {
          const bc = new BroadcastChannel("lm-chat");
          bc.postMessage({ type: "cleared", sid, from: INSTANCE_ID });
          bc.close?.();
        } catch (err) {
          // BroadcastChannel may not be available
        }

        // 4) Update state: clear messages, bump version, mark clearedAt
        set({ messages: [], version: get().version + 1, clearedAt: Date.now() });
      },

      resetSession: async () => {
        set({ isBusy: true });
        try {
          const prev = get().sessionId;
          const next = newSession();

          // Clear persisted storage for old session
          try {
            localStorage.removeItem(`lm:chat:${prev}`);
            localStorage.removeItem(STORAGE_KEY);
          } catch (err) {
            // Silently fail
          }

          // Also clear the legacy chatStore
          chatStore.clear();

          // Ask backend to drop any server memory/tools state for prev session
          await fetch(`/agent/session/reset`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prev_session_id: prev, next_session_id: next }),
            credentials: "same-origin",
          });

          // Clear everything and bump version
          set({ sessionId: next, messages: [], version: get().version + 1, clearedAt: Date.now() });

          // Broadcast to other tabs (tagged with origin)
          try {
            const bc = new BroadcastChannel("lm-chat");
            bc.postMessage({ type: "reset", newSid: next, prev, from: INSTANCE_ID });
            bc.close?.();
          } catch (err) {
            // BroadcastChannel may not be available
          }
        } finally {
          set({ isBusy: false });
        }
      },
    }),
    { name: "lm:chat" }
  )
);

// Cross-tab listener with echo-loop prevention
(function wireBC() {
  if (typeof window === "undefined") return;

  try {
    const bc = new BroadcastChannel("lm-chat");
    bc.onmessage = (ev: MessageEvent) => {
      const msg = ev.data || {};

      // Ignore our own broadcasts to prevent echo loops
      if (msg.from && msg.from === INSTANCE_ID) return;

      if (msg.type === "cleared") {
        // IMPORTANT: do not call clearChat() here (it re-broadcasts).
        // Only update state directly if it's our session.
        const s = useChatSession.getState();
        if (s.sessionId === msg.sid) {
          useChatSession.setState({
            messages: [],
            version: s.version + 1,
            clearedAt: Date.now(),
          });
        }
      }

      if (msg.type === "reset" && msg.newSid) {
        // Similar treatment for reset events
        useChatSession.setState({
          sessionId: msg.newSid,
          messages: [],
          version: useChatSession.getState().version + 1,
          clearedAt: Date.now(),
        });
      }
    };
  } catch (err) {
    // BroadcastChannel may not be available
  }
})();

// Helper to clear persisted thread for a specific session
export function clearPersistedThread(sessionId?: string) {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    // Silently fail
  }
}

// Test utility to reset chat store state
export function __resetChatStoreForTests__() {
  const s = useChatSession.getState();
  useChatSession.setState({
    ...s,
    sessionId: "sid-test",
    messages: [],
    version: 0,
    clearedAt: undefined,
  });
}
