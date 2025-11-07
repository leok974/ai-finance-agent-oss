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

const bc = typeof window !== "undefined" ? new BroadcastChannel("lm-chat") : null;

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

        // 3) Broadcast to other tabs BEFORE state update
        try {
          bc?.postMessage({ type: "cleared", sid });
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

          // Broadcast to other tabs
          bc?.postMessage({ type: "RESET", prev, next });
        } finally {
          set({ isBusy: false });
        }
      },
    }),
    { name: "lm:chat" }
  )
);

// Cross-tab listeners (attach once in app shell)
if (bc) {
  bc.addEventListener("message", (e) => {
    const { type } = e.data ?? {};
    if (type === "cleared" || type === "CLEARED") {
      useChatSession.setState((state) => ({
        messages: [],
        version: state.version + 1,
        clearedAt: Date.now()
      }));
    }
    if (type === "RESET") {
      useChatSession.setState((state) => ({
        messages: [],
        sessionId: e.data.next,
        version: state.version + 1,
        clearedAt: Date.now()
      }));
    }
  });
}

// Helper to clear persisted thread for a specific session
export function clearPersistedThread(sessionId?: string) {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    // Silently fail
  }
}
