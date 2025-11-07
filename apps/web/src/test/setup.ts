import "@testing-library/jest-dom/vitest";

// Mock scrollIntoView which isn't available in jsdom
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

// Mock BroadcastChannel for tests (no-op to prevent cross-tab sync in tests)
class FakeBC {
  onmessage: ((ev: MessageEvent) => void) | null = null;
  postMessage(_msg: any) {
    /* no-op for unit/UI tests */
  }
  close() {}
}

if (!("BroadcastChannel" in globalThis)) {
  // @ts-expect-error - Mocking BroadcastChannel for tests
  global.BroadcastChannel = FakeBC;
}

// Basic localStorage shim if your env lacks it
if (!("localStorage" in globalThis)) {
  const store = new Map<string, string>();
  // @ts-expect-error - Mocking localStorage for tests
  global.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => void store.clear(),
    length: 0,
    key: (_index: number) => null,
  };
}
