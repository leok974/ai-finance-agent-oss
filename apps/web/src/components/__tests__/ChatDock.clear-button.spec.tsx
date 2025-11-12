// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ChatDock from "@/components/ChatDock";
import { AuthContext } from "@/state/auth";
import { MonthContext } from "@/context/MonthContext";
import { ChatDockProvider } from "@/context/ChatDockContext";

// Mock the chatSession store to avoid persist middleware issues
const mockClearChat = vi.fn();
const mockMessages = [
  {
    id: "msg-1",
    role: "user" as const,
    text: "hello world",
    at: Date.now(),
  },
];

vi.mock("@/state/chatSession", () => ({
  useChatSession: vi.fn((selector?: any) => {
    const state = {
      sessionId: "test-session",
      messages: mockMessages,
      isBusy: false,
      version: 1,
      clearedAt: undefined,
      clearChat: mockClearChat,
      resetSession: vi.fn(),
    };
    return selector ? selector(state) : state;
  }),
  __resetChatStoreForTests__: vi.fn(),
}));

// Minimal provider wrapper consistent with other ChatDock tests
function Wrapper(props: { children: React.ReactNode }) {
  return (
    <AuthContext.Provider
      value={{
        user: { email: "tester@example.com", roles: [] },
        authReady: true,
        login: async () => {},
        register: async () => {},
        logout: async () => {},
        refresh: async () => true,
      }}
    >
      <MonthContext.Provider value={{ month: "2025-08", setMonth: () => {} }}>
        <ChatDockProvider>{props.children}</ChatDockProvider>
      </MonthContext.Provider>
    </AuthContext.Provider>
  );
}

beforeEach(() => {
  mockClearChat.mockClear();
  mockMessages.length = 1; // Reset to one message
  mockMessages[0] = {
    id: "msg-1",
    role: "user",
    text: "hello world",
    at: Date.now(),
  };
});

describe("ChatDock Clear button", () => {
  it("opens modal and calls clearChat on confirm", async () => {
    const user = userEvent.setup();

    render(
      <Wrapper>
        <ChatDock />
      </Wrapper>
    );

    // First, open the ChatDock by clicking the bubble
    const openBtn = screen.getByRole("button", { name: /open agent chat/i });
    await user.click(openBtn);

    // Now the Clear button should be visible in the toolbar
    const clearBtn = await screen.findByTestId("agent-tool-clear");
    await user.click(clearBtn);

    // Modal should appear - verify by checking for the modal title
    expect(await screen.findByText(/clear chat history/i)).toBeInTheDocument();

    // Confirm clear
    const confirmBtn = screen.getByTestId("modal-clear-confirm");
    await user.click(confirmBtn);

    // Verify clearChat was called
    expect(mockClearChat).toHaveBeenCalledTimes(1);
  });
});
