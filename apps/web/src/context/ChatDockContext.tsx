import React, { createContext, useContext, useRef, useMemo, useCallback } from 'react';

type Meta = { citations?: { type: string; id?: string; count?: number }[]; ctxMonth?: string; trace?: any[]; model?: string };

type AppendUser = (text: string) => void;
type AppendAssistant = (text: string, opts?: { meta?: Meta }) => void;

type ChatDockContextValue = {
  // External callers use these to append to ChatDock
  appendUser: AppendUser;
  appendAssistant: AppendAssistant;
  // ChatDock registers its handlers here
  setAppendUser: (fn: AppendUser | null) => void;
  setAppendAssistant: (fn: AppendAssistant | null) => void;
};

const noop = () => {};

const ChatDockContext = createContext<ChatDockContextValue>({
  appendUser: noop,
  appendAssistant: noop,
  setAppendUser: noop,
  setAppendAssistant: noop,
});

export function ChatDockProvider({ children }: { children: React.ReactNode }) {
  const appendUserRef = useRef<AppendUser | null>(null);
  const appendAssistantRef = useRef<AppendAssistant | null>(null);

  // Stable setters that update refs
  const setAppendUser = useCallback((fn: AppendUser | null) => {
    if (appendUserRef.current !== fn) appendUserRef.current = fn;
  }, []);

  const setAppendAssistant = useCallback((fn: AppendAssistant | null) => {
    if (appendAssistantRef.current !== fn) appendAssistantRef.current = fn;
  }, []);

  // Memoize the value so consumers don't re-render on every provider render
  const value = useMemo<ChatDockContextValue>(() => ({
    appendUser: (text) => appendUserRef.current?.(text),
    appendAssistant: (text, opts) => appendAssistantRef.current?.(text, opts),
    setAppendUser,
    setAppendAssistant,
  }), [setAppendUser, setAppendAssistant]);

  return <ChatDockContext.Provider value={value}>{children}</ChatDockContext.Provider>;
}

export function useChatDock() {
  return useContext(ChatDockContext);
}
