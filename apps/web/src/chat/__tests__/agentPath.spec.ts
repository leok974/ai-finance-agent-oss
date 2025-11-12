import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveAgentPath } from '../lib/agentPath';

describe('resolveAgentPath', () => {
  beforeEach(() => {
    // Clean up any existing overrides
    delete (globalThis as any).__CHAT_AGENT_PATH__;
    delete (globalThis as any).__API_BASE__;
  });

  afterEach(() => {
    // Clean up after each test
    delete (globalThis as any).__CHAT_AGENT_PATH__;
    delete (globalThis as any).__API_BASE__;
  });

  it('uses explicit override when set', () => {
    (globalThis as any).__CHAT_AGENT_PATH__ = '/custom/agent/chat';
    expect(resolveAgentPath()).toBe('/custom/agent/chat');
  });

  it('uses API_BASE when no override', () => {
    (globalThis as any).__API_BASE__ = '/api';
    expect(resolveAgentPath()).toBe('/api/agent/chat');
  });

  it('strips trailing slash from API_BASE', () => {
    (globalThis as any).__API_BASE__ = '/api/';
    expect(resolveAgentPath()).toBe('/api/agent/chat');
  });

  it('defaults to /api/agent/chat', () => {
    expect(resolveAgentPath()).toBe('/api/agent/chat');
  });

  it('prefers override over API_BASE', () => {
    (globalThis as any).__CHAT_AGENT_PATH__ = '/override';
    (globalThis as any).__API_BASE__ = '/api';
    expect(resolveAgentPath()).toBe('/override');
  });
});
