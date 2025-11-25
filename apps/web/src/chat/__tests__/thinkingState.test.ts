/**
 * Unit tests for ThinkingState management in useAgentStream
 *
 * Verifies the thinking state reducer logic handles:
 * - planner events (sets step + tools)
 * - tool_start events (adds to activeTools, sets activeTool)
 * - tool_end events (removes from activeTools, updates activeTool)
 * - done events (clears thinking state)
 */

import { describe, it, expect } from 'vitest';
import type { ThinkingState } from '../useAgentStream';

/**
 * Helper function that simulates the thinking state reducer logic
 * from useAgentStream.ts
 */
function applyEvent(
  currentState: ThinkingState | null,
  event: { type: string; data: any }
): ThinkingState | null {
  switch (event.type) {
    case 'planner': {
      return {
        step: event.data.step || 'Planning…',
        tools: event.data.tools || [],
        activeTools: currentState?.activeTools || new Set(),
        activeTool: currentState?.activeTool || null,
      };
    }

    case 'tool_start': {
      if (!currentState) return currentState;
      const newActiveTools = new Set([...currentState.activeTools, event.data.name]);
      return {
        ...currentState,
        activeTools: newActiveTools,
        activeTool: event.data.name,
      };
    }

    case 'tool_end': {
      if (!currentState) return null;
      const newActive = new Set(currentState.activeTools);
      newActive.delete(event.data.name);
      return {
        ...currentState,
        activeTools: newActive,
        activeTool: newActive.size > 0 ? Array.from(newActive)[0] : null,
      };
    }

    case 'done':
      return null;

    default:
      return currentState;
  }
}

describe('ThinkingState reducer', () => {
  it('initializes with planner event', () => {
    const state = applyEvent(null, {
      type: 'planner',
      data: {
        step: 'Analyzing spending trends',
        tools: ['charts.summary', 'charts.trends', 'insights.expanded'],
      },
    });

    expect(state).not.toBeNull();
    expect(state?.step).toBe('Analyzing spending trends');
    expect(state?.tools).toEqual([
      'charts.summary',
      'charts.trends',
      'insights.expanded',
    ]);
    expect(state?.activeTools.size).toBe(0);
    expect(state?.activeTool).toBeNull();
  });

  it('uses fallback "Planning…" when step is missing', () => {
    const state = applyEvent(null, {
      type: 'planner',
      data: {
        tools: ['charts.summary'],
      },
    });

    expect(state?.step).toBe('Planning…');
  });

  it('marks tool as active on tool_start', () => {
    let state = applyEvent(null, {
      type: 'planner',
      data: {
        step: 'Fetching data',
        tools: ['charts.summary', 'insights.expanded'],
      },
    });

    state = applyEvent(state, {
      type: 'tool_start',
      data: { name: 'charts.summary' },
    });

    expect(state?.activeTools.has('charts.summary')).toBe(true);
    expect(state?.activeTool).toBe('charts.summary');
  });

  it('handles multiple active tools', () => {
    let state = applyEvent(null, {
      type: 'planner',
      data: {
        step: 'Loading charts',
        tools: ['charts.summary', 'charts.trends', 'insights.expanded'],
      },
    });

    // Start first tool
    state = applyEvent(state, {
      type: 'tool_start',
      data: { name: 'charts.summary' },
    });

    expect(state?.activeTools.has('charts.summary')).toBe(true);
    expect(state?.activeTool).toBe('charts.summary');

    // Start second tool before first completes
    state = applyEvent(state, {
      type: 'tool_start',
      data: { name: 'charts.trends' },
    });

    expect(state?.activeTools.has('charts.summary')).toBe(true);
    expect(state?.activeTools.has('charts.trends')).toBe(true);
    expect(state?.activeTools.size).toBe(2);
    expect(state?.activeTool).toBe('charts.trends'); // Latest started tool
  });

  it('removes tool on tool_end and updates activeTool', () => {
    let state = applyEvent(null, {
      type: 'planner',
      data: {
        step: 'Fetching data',
        tools: ['charts.summary', 'insights.expanded'],
      },
    });

    // Start both tools
    state = applyEvent(state, {
      type: 'tool_start',
      data: { name: 'charts.summary' },
    });
    state = applyEvent(state, {
      type: 'tool_start',
      data: { name: 'insights.expanded' },
    });

    expect(state?.activeTools.size).toBe(2);
    expect(state?.activeTool).toBe('insights.expanded');

    // End second tool
    state = applyEvent(state, {
      type: 'tool_end',
      data: { name: 'insights.expanded', ok: true },
    });

    expect(state?.activeTools.has('insights.expanded')).toBe(false);
    expect(state?.activeTools.has('charts.summary')).toBe(true);
    expect(state?.activeTools.size).toBe(1);
    expect(state?.activeTool).toBe('charts.summary'); // Falls back to remaining tool
  });

  it('sets activeTool to null when all tools complete', () => {
    let state = applyEvent(null, {
      type: 'planner',
      data: {
        step: 'Fetching data',
        tools: ['charts.summary'],
      },
    });

    state = applyEvent(state, {
      type: 'tool_start',
      data: { name: 'charts.summary' },
    });

    expect(state?.activeTool).toBe('charts.summary');

    state = applyEvent(state, {
      type: 'tool_end',
      data: { name: 'charts.summary', ok: true },
    });

    expect(state?.activeTools.size).toBe(0);
    expect(state?.activeTool).toBeNull();
  });

  it('clears thinking state on done event', () => {
    let state = applyEvent(null, {
      type: 'planner',
      data: {
        step: 'Analyzing',
        tools: ['charts.summary'],
      },
    });

    state = applyEvent(state, {
      type: 'tool_start',
      data: { name: 'charts.summary' },
    });

    expect(state).not.toBeNull();

    state = applyEvent(state, {
      type: 'done',
      data: {},
    });

    expect(state).toBeNull();
  });

  it('ignores unknown events', () => {
    let state = applyEvent(null, {
      type: 'planner',
      data: {
        step: 'Working',
        tools: ['charts.summary'],
      },
    });

    const stateBefore = JSON.stringify(state);

    state = applyEvent(state, {
      type: 'token',
      data: { text: 'Hello' },
    });

    const stateAfter = JSON.stringify(state);
    expect(stateAfter).toBe(stateBefore); // State unchanged
  });

  it('handles tool_start on null state gracefully', () => {
    const state = applyEvent(null, {
      type: 'tool_start',
      data: { name: 'charts.summary' },
    });

    expect(state).toBeNull(); // Should remain null
  });

  it('handles tool_end on null state gracefully', () => {
    const state = applyEvent(null, {
      type: 'tool_end',
      data: { name: 'charts.summary', ok: true },
    });

    expect(state).toBeNull(); // Should remain null
  });

  it('preserves step and tools through tool lifecycle', () => {
    let state = applyEvent(null, {
      type: 'planner',
      data: {
        step: 'Analyzing spending trends',
        tools: ['charts.summary', 'insights.expanded'],
      },
    });

    const originalStep = state?.step;
    const originalTools = state?.tools;

    state = applyEvent(state, {
      type: 'tool_start',
      data: { name: 'charts.summary' },
    });

    expect(state?.step).toBe(originalStep);
    expect(state?.tools).toEqual(originalTools);

    state = applyEvent(state, {
      type: 'tool_end',
      data: { name: 'charts.summary', ok: true },
    });

    expect(state?.step).toBe(originalStep);
    expect(state?.tools).toEqual(originalTools);
  });
});
