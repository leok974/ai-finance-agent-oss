// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatControls } from "@/features/chat/ChatControls";
import { useChatSession } from "@/state/chatSession";

// Mock telemetry
vi.mock("@/lib/telemetry", () => ({
  telemetry: { track: vi.fn() },
  AGENT_TOOL_EVENTS: { CLEAR: "clear" },
}));

// Mock toast hook
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

// Mock store with in-memory localStorage
const store = new Map<string, string>();
const ls = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => void store.clear(),
};

class FakeBC {
  posted: any[] = [];
  postMessage(msg: any) { this.posted.push(msg); }
  close() {}
  addEventListener() {}
}

beforeEach(() => {
  store.clear();
  // @ts-expect-error test stub
  global.localStorage = ls;
  // @ts-expect-error test stub
  global.BroadcastChannel = vi.fn(() => new FakeBC());

  // Reset store to initial state
  const s = useChatSession.getState();
  useChatSession.setState({
    ...s,
    sessionId: "test-session-id",
    messages: [
      { id: "1", role: "user", text: "Hello", at: Date.now() },
      { id: "2", role: "assistant", text: "Hi there!", at: Date.now() },
    ],
    version: 0,
    isBusy: false,
    clearedAt: undefined,
  });
});

describe("ChatControls", () => {
  it("opens Clear modal when button clicked", async () => {
    render(<ChatControls />);
    const user = userEvent.setup();

    await user.click(screen.getByTestId("agent-tool-clear"));

    // Modal opens - look for the title text
    expect(await screen.findByText("Clear chat history?")).toBeInTheDocument();
    expect(screen.getByText(/remove the visible messages/i)).toBeInTheDocument();
  });

  it("clears messages when Clear modal confirmed", async () => {
    render(<ChatControls />);
    const user = userEvent.setup();

    // Open modal
    await user.click(screen.getByTestId("agent-tool-clear"));
    await screen.findByText("Clear chat history?");

    // Confirm
    await user.click(screen.getByTestId("modal-clear-confirm"));

    // Wait for state update
    await waitFor(() => {
      const state = useChatSession.getState();
      expect(state.messages.length).toBe(0);
      expect(state.version).toBe(1);
    });
  });

  it("closes modal when Cancel clicked", async () => {
    render(<ChatControls />);
    const user = userEvent.setup();

    // Open modal
    await user.click(screen.getByTestId("agent-tool-clear"));
    await screen.findByText("Clear chat history?");

    // Cancel
    await user.click(screen.getByTestId("modal-cancel"));

    // Modal should be gone
    await waitFor(() => {
      expect(screen.queryByText("Clear chat history?")).not.toBeInTheDocument();
    });

    // Messages should not be cleared
    const state = useChatSession.getState();
    expect(state.messages.length).toBe(2);
    expect(state.version).toBe(0);
  });

  it("exposes openClearModal via ref", () => {
    const ref = { current: null } as any;
    render(<ChatControls ref={ref} />);

    expect(ref.current).toBeDefined();
    expect(typeof ref.current.openClearModal).toBe("function");
    expect(typeof ref.current.openResetModal).toBe("function");
  });
});
