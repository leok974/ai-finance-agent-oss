// Minimal chat storage with cross-tab sync
// Shape: an array of { role, content, createdAt }
export type BasicMsg = { role: string; content: string; createdAt: number };

const LS_KEY = "financeAgent.chat.messages.v1";
const CHANNEL = "financeAgent.chat.broadcast";

type Listener = (msgs: BasicMsg[]) => void;
const listeners = new Set<Listener>();

function read(): BasicMsg[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr as BasicMsg[];
  } catch {
    return [];
  }
}

function write(msgs: BasicMsg[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(msgs));
}

const bc = typeof window !== "undefined" && "BroadcastChannel" in window
  ? new BroadcastChannel(CHANNEL)
  : null;

function notify() {
  const data = read();
  for (const fn of listeners) fn(data);
}

export const chatStore = {
  initCrossTab() {
    // Storage event (other tabs)
    window.addEventListener("storage", (e) => {
      if (e.key === LS_KEY) notify();
    });
    // BroadcastChannel (faster, explicit)
    bc?.addEventListener("message", () => notify());
  },
  subscribe(fn: Listener) {
    listeners.add(fn);
    fn(read());
    return () => listeners.delete(fn);
  },
  get(): BasicMsg[] {
    return read();
  },
  set(msgs: BasicMsg[]) {
    write(msgs);
    bc?.postMessage("update");
    notify();
  },
  append(msg: BasicMsg) {
    const cur = read();
    cur.push(msg);
    write(cur);
    bc?.postMessage("update");
    notify();
  },
  clear() {
    try {
      // Hard reset key to trigger storage event in other tabs
      localStorage.removeItem(LS_KEY);
    } catch {
      write([]); // fallback if removeItem fails
    }
    bc?.postMessage("clear");
    notify();
  },
};

// --- Undo snapshot support ---
const CHAT_UNDO_KEY = 'chatStore:undo';

export function snapshot(): { t: number; count: number } {
  try {
    const msgs = read();
    const t = Date.now();
    const payload = JSON.stringify({ t, msgs });
    localStorage.setItem(CHAT_UNDO_KEY, payload);
    return { t, count: msgs.length };
  } catch {
    return { t: Date.now(), count: 0 };
  }
}

export function hasSnapshot(): boolean {
  try {
    return !!localStorage.getItem(CHAT_UNDO_KEY);
  } catch {
    return false;
  }
}

export function restoreFromSnapshot(): { ok: boolean; count: number } {
  try {
    const raw = localStorage.getItem(CHAT_UNDO_KEY);
    if (!raw) return { ok: false, count: 0 };
    const parsed = JSON.parse(raw);
    const msgs = Array.isArray(parsed?.msgs) ? (parsed.msgs as BasicMsg[]) : null;
    if (!msgs) return { ok: false, count: 0 };
    // Use chatStore.set to broadcast and notify listeners across tabs
    chatStore.set(msgs);
    localStorage.removeItem(CHAT_UNDO_KEY);
    return { ok: true, count: msgs.length };
  } catch {
    return { ok: false, count: 0 };
  }
}

export function discardSnapshot(): void {
  try {
    localStorage.removeItem(CHAT_UNDO_KEY);
  } catch { /* ignore */ }
}
