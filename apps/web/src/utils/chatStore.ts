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
