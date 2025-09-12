import React, { createContext, useContext, useRef } from 'react';

type Meta = { citations?: { type: string; id?: string; count?: number }[]; ctxMonth?: string; trace?: any[]; model?: string };

type ChatDockContextValue = {
  // External callers use these to append to ChatDock
  appendUser: (text: string) => void;
  appendAssistant: (text: string, opts?: { meta?: Meta }) => void;
  // ChatDock registers its handlers here
  setAppendUser: (fn: (text: string) => void) => void;
  setAppendAssistant: (fn: (text: string, opts?: { meta?: Meta }) => void) => void;
};

const noop = () => {};

const ChatDockContext = createContext<ChatDockContextValue>({
  appendUser: noop,
  appendAssistant: noop,
  setAppendUser: noop,
  setAppendAssistant: noop,
});

export function ChatDockProvider({ children }: { children: React.ReactNode }) {
  const appendUserRef = useRef<(text: string) => void>(() => {});
  const appendAssistantRef = useRef<(text: string, opts?: { meta?: Meta }) => void>(() => {});

  const value: ChatDockContextValue = {
    appendUser: (text) => appendUserRef.current?.(text),
    appendAssistant: (text, opts) => appendAssistantRef.current?.(text, opts),
    setAppendUser: (fn) => { appendUserRef.current = fn; },
    setAppendAssistant: (fn) => { appendAssistantRef.current = fn; },
  };

  return <ChatDockContext.Provider value={value}>{children}</ChatDockContext.Provider>;
}

export function useChatDock() {
  return useContext(ChatDockContext);
}
