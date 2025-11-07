import { create } from "zustand";
import { persist } from "zustand/middleware";
import { chatStore } from "@/utils/chatStore";

type Msg = { id: string; role: "user" | "assistant"; text: string; at: number; meta?: Record<string, any> };

type ChatState = {
  sessionId: string;
  messages: Msg[];
  isBusy: boolean;
  version: number; // Force re-render key
  clearChat: () => Promise<void>;
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

      clearChat: async () => {
        // 1) Create NEW array ref to ensure React detects change
        set({ messages: [], version: get().version + 1 });

        // 2) Clear persisted storage for this session
        try {
          localStorage.removeItem(STORAGE_KEY);
        } catch (err) {
          // Silently fail - storage may not be available
        }

        // 3) Also clear the legacy chatStore for backward compatibility
        chatStore.clear();

        // 4) Broadcast to other tabs
        bc?.postMessage({ type: "CLEARED", sessionId: get().sessionId });
      },

      resetSession: async () => {
        set({ isBusy: true });
        try {
          const prev = get().sessionId;
          const next = newSession();

          // Ask backend to drop any server memory/tools state for prev session
          await fetch(`/agent/session/reset`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prev_session_id: prev, next_session_id: next }),
            credentials: "same-origin",
          });

          // Clear everything and bump version
          set({ sessionId: next, messages: [], version: get().version + 1 });

          // Clear persisted storage
          try {
            localStorage.removeItem(STORAGE_KEY);
          } catch (err) {
            // Silently fail
          }

          // Also clear the legacy chatStore
          chatStore.clear();
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
    if (type === "CLEARED") {
      useChatSession.setState((state) => ({
        messages: [],
        version: state.version + 1
      }));
    }
    if (type === "RESET") {
      useChatSession.setState((state) => ({
        messages: [],
        sessionId: e.data.next,
        version: state.version + 1
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
