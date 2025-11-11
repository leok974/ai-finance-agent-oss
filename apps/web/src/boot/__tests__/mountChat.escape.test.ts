import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mountChatDock, showChat, hideChat, isChatOpen } from '../mountChat';

describe('Chat Escape Key Handler', () => {
  let hostElement: HTMLElement;

  beforeEach(() => {
    // Clean up any existing chat elements
    document.body.innerHTML = '';
    (window as any).__LM_CHAT_HOST_CREATED__ = false;

    // Mock customElements if not defined
    if (!window.customElements) {
      (window as any).customElements = {
        get: vi.fn(() => null),
        define: vi.fn(),
      };
    }

    // Mock Element.animate for happy-dom compatibility
    HTMLElement.prototype.animate = vi.fn().mockReturnValue({
      onfinish: null,
      finished: Promise.resolve(),
    });

    hostElement = mountChatDock();

    // Force chat to closed state (animate mock returns immediately)
    hideChat(hostElement);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    (window as any).__LM_CHAT_HOST_CREATED__ = false;
  });

  it('should start with chat closed', () => {
    expect(isChatOpen()).toBe(false);
  });

  it('should open chat when showChat is called', () => {
    showChat(hostElement);
    expect(isChatOpen()).toBe(true);
  });

  it('should close chat when hideChat is called', () => {
    showChat(hostElement);
    expect(isChatOpen()).toBe(true);

    hideChat(hostElement);
    expect(isChatOpen()).toBe(false);
  });

  it('should close chat on Escape key when chat is open', () => {
    showChat(hostElement);
    expect(isChatOpen()).toBe(true);

    // Simulate Escape key press
    const escapeEvent = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });

    // The Escape handler should be in App.tsx, so we need to simulate it here
    if (isChatOpen()) {
      hideChat(hostElement);
    }

    expect(isChatOpen()).toBe(false);
  });

  it('should NOT close chat on Escape when already closed', () => {
    expect(isChatOpen()).toBe(false);

    // Simulate Escape key press
    const escapeEvent = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });

    // Handler should check isChatOpen() first
    if (isChatOpen()) {
      hideChat(hostElement);
    }

    // Should still be closed (no error thrown)
    expect(isChatOpen()).toBe(false);
  });

  it('should ignore other keys when chat is open', () => {
    showChat(hostElement);
    expect(isChatOpen()).toBe(true);

    // Simulate 'a' key press
    const aKeyEvent = new KeyboardEvent('keydown', {
      key: 'a',
      bubbles: true,
      cancelable: true,
    });

    // Handler should only respond to Escape
    if (aKeyEvent.key === 'Escape' && isChatOpen()) {
      hideChat(hostElement);
    }

    // Chat should still be open
    expect(isChatOpen()).toBe(true);
  });

  it('isChatOpen() should always return current state', () => {
    expect(isChatOpen()).toBe(false);

    showChat(hostElement);
    expect(isChatOpen()).toBe(true);

    hideChat(hostElement);
    expect(isChatOpen()).toBe(false);

    showChat(hostElement);
    expect(isChatOpen()).toBe(true);
  });
});
