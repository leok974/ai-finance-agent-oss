import { describe, it, expect } from 'vitest';
import { getToolsOpen, showTools, hideTools, toggleTools, subscribe } from '../toolsPanel';

describe('toolsPanel', () => {
  it('starts with visible: true', () => {
    expect(getToolsOpen()).toBe(true);
  });

  it('hideTools() sets visible to false', () => {
    showTools(); // ensure starting state
    hideTools();
    expect(getToolsOpen()).toBe(false);
  });

  it('showTools() sets visible to true', () => {
    hideTools(); // ensure starting state
    showTools();
    expect(getToolsOpen()).toBe(true);
  });

  it('toggleTools() flips visibility', () => {
    showTools(); // ensure starting state
    const before = getToolsOpen();
    toggleTools();
    expect(getToolsOpen()).toBe(!before);
    toggleTools();
    expect(getToolsOpen()).toBe(before);
  });

  it('notifies subscribers on state change', () => {
    const states: boolean[] = [];
    const unsub = subscribe((visible) => states.push(visible));

    // Initial notification
    expect(states.length).toBe(1);

    hideTools();
    expect(states.length).toBe(2);
    expect(states[1]).toBe(false);

    showTools();
    expect(states.length).toBe(3);
    expect(states[2]).toBe(true);

    unsub();

    // After unsubscribe, no more notifications
    toggleTools();
    expect(states.length).toBe(3);
  });
});
