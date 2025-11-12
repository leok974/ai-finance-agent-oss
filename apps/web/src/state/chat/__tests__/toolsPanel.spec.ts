import { describe, it, expect } from 'vitest';
import { toolsPanel } from '../toolsPanel';

describe('toolsPanel', () => {
  it('starts with visible: true', () => {
    expect(toolsPanel.getState().visible).toBe(true);
  });

  it('hideTools() sets visible to false', () => {
    toolsPanel.showTools(); // ensure starting state
    toolsPanel.hideTools();
    expect(toolsPanel.getState().visible).toBe(false);
  });

  it('showTools() sets visible to true', () => {
    toolsPanel.hideTools(); // ensure starting state
    toolsPanel.showTools();
    expect(toolsPanel.getState().visible).toBe(true);
  });

  it('toggleTools() flips visibility', () => {
    toolsPanel.showTools(); // ensure starting state
    const before = toolsPanel.getState().visible;
    toolsPanel.toggleTools();
    expect(toolsPanel.getState().visible).toBe(!before);
    toolsPanel.toggleTools();
    expect(toolsPanel.getState().visible).toBe(before);
  });

  it('notifies subscribers on state change', () => {
    const states: boolean[] = [];
    const unsub = toolsPanel.subscribe((state) => states.push(state.visible));

    // Initial notification
    expect(states.length).toBe(1);

    toolsPanel.hideTools();
    expect(states.length).toBe(2);
    expect(states[1]).toBe(false);

    toolsPanel.showTools();
    expect(states.length).toBe(3);
    expect(states[2]).toBe(true);

    unsub();

    // After unsubscribe, no more notifications
    toolsPanel.toggleTools();
    expect(states.length).toBe(3);
  });
});
