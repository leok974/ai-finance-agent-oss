import { describe, it, expect, beforeEach } from 'vitest';
import { chatStore, snapshot, hasSnapshot, restoreFromSnapshot, discardSnapshot, BasicMsg } from '../chatStore';

// Provide minimal localStorage + BroadcastChannel polyfills for happy-dom
class MockBroadcastChannel {
  name: string; handlers: Record<string, Function[]> = {};
  constructor(name: string) { this.name = name; }
  postMessage(_msg: any) { (this.handlers['message']||[]).forEach(fn=>fn({ data: _msg })); }
  addEventListener(type: string, fn: any) { (this.handlers[type] ||= []).push(fn); }
  close() {}
}

// @ts-ignore
if (!(globalThis as any).BroadcastChannel) (globalThis as any).BroadcastChannel = MockBroadcastChannel as any;

function make(role: string, content: string): BasicMsg { return { role, content, createdAt: Date.now() }; }

describe('chatStore basic operations', () => {
  beforeEach(() => {
    localStorage.clear();
    // Re-init listeners side effects not required for these tests
  });

  it('append & get roundtrip', () => {
    const m1 = make('user','hi');
    chatStore.append(m1);
    const m2 = make('assistant','hello');
    chatStore.append(m2);
    const all = chatStore.get();
    expect(all.length).toBe(2);
    expect(all[0].content).toBe('hi');
    expect(all[1].role).toBe('assistant');
  });

  it('set replaces messages & clear empties', () => {
    chatStore.set([make('user','one'), make('user','two')]);
    expect(chatStore.get().length).toBe(2);
    chatStore.clear();
    expect(chatStore.get().length).toBe(0);
  });

  it('snapshot + restore workflow', () => {
    chatStore.set([make('user','alpha'), make('assistant','beta')]);
    const snapMeta = snapshot();
    expect(snapMeta.count).toBe(2);
    expect(hasSnapshot()).toBe(true);
    chatStore.clear();
    expect(chatStore.get().length).toBe(0);
    const restored = restoreFromSnapshot();
    expect(restored.ok).toBe(true);
    expect(restored.count).toBe(2);
    expect(chatStore.get().length).toBe(2);
    discardSnapshot();
    expect(hasSnapshot()).toBe(false);
  });
});
