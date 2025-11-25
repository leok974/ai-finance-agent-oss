/**
 * useAgentStream - Hook for consuming NDJSON agent streaming
 *
 * Connects to GET /agent/stream endpoint and processes event stream:
 * - start: Session initialization
 * - planner: Shows thinking step and tool list
 * - tool_start/tool_end: Tool execution lifecycle
 * - token: Progressive text rendering
 * - done: Stream completion
 * - error: Error handling
 */

import { useState, useRef, useCallback } from 'react';
import { API_BASE } from '@/lib/api';

export interface ThinkingState {
  step: string;
  tools: string[];
  activeTools: Set<string>;
}

export interface StreamMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface UseAgentStreamResult {
  messages: StreamMessage[];
  isStreaming: boolean;
  thinkingState: ThinkingState | null;
  sendMessage: (text: string, options?: { month?: string; mode?: string }) => Promise<void>;
  cancel: () => void;
}

export function useAgentStream(): UseAgentStreamResult {
  const [messages, setMessages] = useState<StreamMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [thinkingState, setThinkingState] = useState<ThinkingState | null>(null);

  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (readerRef.current) {
      readerRef.current.cancel();
      readerRef.current = null;
    }
    setIsStreaming(false);
    setThinkingState(null);
  }, []);

  const sendMessage = useCallback(
    async (text: string, options?: { month?: string; mode?: string }) => {
      // Cancel any existing stream
      cancel();

      // Add user message immediately
      const userMessage: StreamMessage = {
        role: 'user',
        content: text,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, userMessage]);

      // Build query params
      const params = new URLSearchParams({ q: text });
      if (options?.month) params.set('month', options.month);
      if (options?.mode) params.set('mode', options.mode);

      // Start streaming
      setIsStreaming(true);
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      let assistantContent = '';
      const assistantTimestamp = Date.now();

      try {
        const url = `${API_BASE}/agent/stream?${params.toString()}`;
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            Accept: 'application/x-ndjson',
          },
          credentials: 'same-origin',
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        if (!response.body) {
          throw new Error('Response body is null');
        }

        const reader = response.body.getReader();
        readerRef.current = reader;
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n').filter((line) => line.trim());

          for (const line of lines) {
            try {
              const event = JSON.parse(line);

              switch (event.type) {
                case 'start':
                  // Session started
                  break;

                case 'planner':
                  setThinkingState({
                    step: event.data.step || 'Planning...',
                    tools: event.data.tools || [],
                    activeTools: new Set(),
                  });
                  break;

                case 'tool_start':
                  setThinkingState((prev) =>
                    prev
                      ? {
                          ...prev,
                          activeTools: new Set([...prev.activeTools, event.data.name]),
                        }
                      : null
                  );
                  break;

                case 'tool_end':
                  setThinkingState((prev) => {
                    if (!prev) return null;
                    const newActive = new Set(prev.activeTools);
                    newActive.delete(event.data.name);
                    return { ...prev, activeTools: newActive };
                  });
                  break;

                case 'token':
                  assistantContent += event.data.text || '';
                  // Update assistant message progressively
                  setMessages((prev) => {
                    const last = prev[prev.length - 1];
                    if (last && last.role === 'assistant' && last.timestamp === assistantTimestamp) {
                      // Update existing assistant message
                      return [
                        ...prev.slice(0, -1),
                        { ...last, content: assistantContent },
                      ];
                    } else {
                      // Create new assistant message
                      return [
                        ...prev,
                        {
                          role: 'assistant',
                          content: assistantContent,
                          timestamp: assistantTimestamp,
                        },
                      ];
                    }
                  });
                  break;

                case 'done':
                  setIsStreaming(false);
                  setThinkingState(null);
                  break;

                case 'error':
                  console.error('[useAgentStream] Error event:', event.data);
                  setIsStreaming(false);
                  setThinkingState(null);
                  // Add error message
                  setMessages((prev) => [
                    ...prev,
                    {
                      role: 'assistant',
                      content: `Error: ${event.data.message || 'Unknown error'}`,
                      timestamp: Date.now(),
                    },
                  ]);
                  break;
              }
            } catch (parseError) {
              console.error('[useAgentStream] Failed to parse event:', line, parseError);
            }
          }
        }
      } catch (error: any) {
        if (error.name === 'AbortError') {
          console.log('[useAgentStream] Stream cancelled');
        } else {
          console.error('[useAgentStream] Stream error:', error);
          setMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              content: `Failed to connect: ${error.message}`,
              timestamp: Date.now(),
            },
          ]);
        }
      } finally {
        setIsStreaming(false);
        setThinkingState(null);
        readerRef.current = null;
        abortControllerRef.current = null;
      }
    },
    [cancel]
  );

  return {
    messages,
    isStreaming,
    thinkingState,
    sendMessage,
    cancel,
  };
}
