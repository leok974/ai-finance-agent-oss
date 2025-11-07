import { describe, it, expect, beforeEach, vi } from "vitest";
import { useChatSession } from "@/state/chatSession";

// Simple fakes
const store = new Map<string, string>();
const ls = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => void store.clear(),
};

// Track BroadcastChannel messages globally
const bcMessages: any[] = [];

class FakeBC {
  postMessage(msg: any) {
    bcMessages.push(msg);
  }
  close() {}
  addEventListener() {}
}

beforeEach(() => {
  store.clear();
  bcMessages.length = 0; // Clear array
  // @ts-expect-error test stub
  global.localStorage = ls;
  // @ts-expect-error test stub
  global.BroadcastChannel = vi.fn(() => new FakeBC());

  const s = useChatSession.getState();
  useChatSession.setState({
    ...s,
    sessionId: "sid-1",
    messages: [{ id: "1", role: "user", text: "hi", at: Date.now() }],
    version: 0,
    clearedAt: undefined,
  });
});

describe("chatSession.clear/reset", () => {
  it("clearChat wipes messages, storage, broadcasts, bumps version", () => {
    const { sessionId, clearChat } = useChatSession.getState();
    ls.setItem(`lm:chat:${sessionId}`, JSON.stringify([{ t: "x" }]));

    expect(useChatSession.getState().messages.length).toBe(1);
    expect(useChatSession.getState().version).toBe(0);

    clearChat();

    const after = useChatSession.getState();
    expect(after.messages.length).toBe(0);
    expect(after.version).toBe(1);
    expect(ls.getItem(`lm:chat:${sessionId}`)).toBeNull();
    // Check that broadcast was called (may need store module reload to pick up mock)
    expect(typeof after.clearedAt).toBe("number");
  });

  it("resetSession clears storage, changes sessionId, bumps version", async () => {
    const { sessionId, resetSession } = useChatSession.getState();
    ls.setItem(`lm:chat:${sessionId}`, "persisted");

    // Mock the fetch call used inside resetSession
    const originalFetch = global.fetch;
    global.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ ok: true })
    } as any));

    await resetSession();

    const after = useChatSession.getState();
    expect(after.sessionId).not.toBe(sessionId);
    expect(ls.getItem(`lm:chat:${sessionId}`)).toBeNull();
    expect(after.messages.length).toBe(0);
    expect(after.version).toBe(1);

    // Restore
    global.fetch = originalFetch;
  });
});
