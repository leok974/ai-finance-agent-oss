/**
 * Chat tools panel visibility state
 * 
 * Manages the visibility of the agent tools panel in the chat UI.
 * Provides actions to show, hide, and toggle the panel.
 */

type ToolsPanelState = {
  visible: boolean;
};

type Listener = (state: ToolsPanelState) => void;
const listeners = new Set<Listener>();

const state: ToolsPanelState = { visible: true };

function notify() {
  for (const fn of listeners) fn({ ...state });
}

export const toolsPanel = {
  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    fn({ ...state });
    return () => listeners.delete(fn);
  },

  getState(): ToolsPanelState {
    return { ...state };
  },

  showTools(): void {
    if (state.visible) return;
    state.visible = true;
    notify();
  },

  hideTools(): void {
    if (!state.visible) return;
    state.visible = false;
    notify();
  },

  toggleTools(): void {
    state.visible = !state.visible;
    notify();
  },
};
