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
 *
 * Features:
 * - Automatic retry with exponential backoff for transient errors
 * - Thinking state persistence to localStorage
 * - Cancel support with cleanup
 * - Warmup indicator before first token
 */

import { useState, useRef, useCallback } from 'react';
import { API_BASE } from '@/lib/api';
import { toast } from 'sonner';

export interface ThinkingState {
  step?: string;
  tools: string[];
  activeTools: Set<string>;
  activeTool?: string | null;
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
  hasReceivedToken: boolean;
  error: "unavailable" | null;
  sendMessage: (text: string, options?: { month?: string; mode?: string }) => Promise<void>;
  cancel: () => void;
}

const RETRY_DELAYS_MS = [250, 750, 2000] as const;
const THINKING_STATE_KEY = 'lm:thinking';

const isTransientError = (err: unknown): boolean => {
  if (!err) return false;
  const msg =
    typeof err === 'string'
      ? err.toLowerCase()
      : (err as any)?.message?.toLowerCase?.() ?? '';

  return (
    msg.includes('network') ||
    msg.includes('econnreset') ||
    msg.includes('timed out') ||
    msg.includes('load failed') ||
    msg.includes('fetch') ||
    msg.includes('aborted')
  );
};

export function useAgentStream(): UseAgentStreamResult {
  const [messages, setMessages] = useState<StreamMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [hasReceivedToken, setHasReceivedToken] = useState(false);
  const [error, setError] = useState<"unavailable" | null>(null);

  // Initialize thinking state from localStorage
  const [thinkingState, setThinkingState] = useState<ThinkingState | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = window.localStorage.getItem(THINKING_STATE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      // Convert tools array back to Set
      return {
        ...parsed,
        activeTools: new Set(parsed.activeTools || []),
      };
    } catch {
      return null;
    }
  });

  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const retryIndexRef = useRef(0);

  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (readerRef.current) {
      readerRef.current.cancel();
      readerRef.current = null;
    }
    retryIndexRef.current = 0;
    setIsStreaming(false);
    setThinkingState(null);
    setHasReceivedToken(false);
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(THINKING_STATE_KEY);
    }
  }, []);

  const persistThinkingState = useCallback((state: ThinkingState | null) => {
    if (typeof window === 'undefined') return;
    if (!state) {
      window.localStorage.removeItem(THINKING_STATE_KEY);
      return;
    }
    // Convert Set to array for JSON serialization
    const serializable = {
      ...state,
      activeTools: Array.from(state.activeTools),
    };
    window.localStorage.setItem(THINKING_STATE_KEY, JSON.stringify(serializable));
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

      // Reset state for new run
      setIsStreaming(true);
      setHasReceivedToken(false);
      setError(null);
      retryIndexRef.current = 0;

      let assistantContent = '';
      const assistantTimestamp = Date.now();

      const runOnce = async (): Promise<void> => {
        // Build query params
        const params = new URLSearchParams({ q: text });
        if (options?.month) params.set('month', options.month);
        if (options?.mode) params.set('mode', options.mode);

        const abortController = new AbortController();
        abortControllerRef.current = abortController;

        let response: Response;
        try {
          const url = `${API_BASE}/agent/stream?${params.toString()}`;
          response = await fetch(url, {
            method: 'GET',
            headers: {
              Accept: 'application/x-ndjson',
            },
            credentials: 'same-origin',
            signal: abortController.signal,
          });
        } catch (err: any) {
          // Retry on transient network errors
          if (isTransientError(err) && retryIndexRef.current < RETRY_DELAYS_MS.length) {
            const delay = RETRY_DELAYS_MS[retryIndexRef.current++];
            await new Promise((resolve) => setTimeout(resolve, delay));
            return runOnce();
          }

          setIsStreaming(false);
          toast.error('Could not reach LedgerMind agent', {
            description: 'Please check your connection and try again.',
          });
          return;
        }

        if (!response.ok) {
          setIsStreaming(false);
          toast.error('Agent request failed', {
            description: `Status ${response.status}`,
          });
          setMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              content: `Request failed with status ${response.status}`,
              timestamp: Date.now(),
            },
          ]);
          return;
        }

        if (!response.body) {
          setIsStreaming(false);
          toast.error('No response body');
          return;
        }

        const reader = response.body.getReader();
        readerRef.current = reader;
        const decoder = new TextDecoder();
        let buffer = ''; // Buffer for incomplete JSON

        // Helper to parse event lines with fallback for escaped \n sequences
        const parseEventLine = (rawLine: string) => {
          if (!rawLine) return;
          
          try {
            const event = JSON.parse(rawLine);
            handleEvent(event);
            return;
          } catch (err) {
            // Fallback: sometimes backend sends multiple JSON objects joined with literal '\n'
            // e.g. '{"type":"token",...}\\n{"type":"token",...}\\n{"type":"done",...}'
            console.warn('[useAgentStream] Primary parse failed, trying fallback split', err);

            const parts = rawLine
              .split(/\\n/g)          // split on literal "\n"
              .map((p) => p.trim())
              .filter(Boolean);

            if (parts.length <= 1) {
              console.warn('[useAgentStream] Failed to parse event line:', rawLine, err);
              return;
            }

            for (const part of parts) {
              try {
                const event = JSON.parse(part);
                handleEvent(event);
              } catch (innerErr) {
                console.warn('[useAgentStream] Failed to parse sub-event part:', part, innerErr);
              }
            }
          }
        };

        // Event handler extracted for reuse
        const handleEvent = (event: any) => {
          switch (event.type) {
                  case 'start':
                    // Session started
                    break;

                  case 'planner':
                    setThinkingState((prev) => {
                      const next: ThinkingState = {
                        step: event.data.step || 'Planning…',
                        tools: event.data.tools || [],
                        activeTools: prev?.activeTools || new Set(),
                        activeTool: prev?.activeTool || null,
                      };
                      persistThinkingState(next);
                      return next;
                    });
                    break;

                  case 'tool_start':
                    setThinkingState((prev) => {
                      if (!prev) return prev;
                      const next: ThinkingState = {
                        ...prev,
                        activeTools: new Set([...prev.activeTools, event.data.name]),
                        activeTool: event.data.name,
                      };
                      persistThinkingState(next);
                      return next;
                    });
                    break;

                  case 'tool_end':
                    setThinkingState((prev) => {
                      if (!prev) return null;
                      const newActive = new Set(prev.activeTools);
                      newActive.delete(event.data.name);
                      const next: ThinkingState = {
                        ...prev,
                        activeTools: newActive,
                        activeTool: newActive.size > 0 ? Array.from(newActive)[0] : null,
                      };
                      persistThinkingState(next);
                      return next;
                    });
                    break;

                  case 'token': {
                    const tokenText = event.data.text || '';
                    if (!tokenText) break;

                    setHasReceivedToken(true);
                    setError(null);
                    assistantContent += tokenText;

                    // Update assistant message progressively
                    setMessages((prev) => {
                      const last = prev[prev.length - 1];
                      if (
                        last &&
                        last.role === 'assistant' &&
                        last.timestamp === assistantTimestamp
                      ) {
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
                  }

                  case 'done':
                    setIsStreaming(false);
                    setThinkingState(null);
                    persistThinkingState(null);
                    setError(null);
                    break;

                  case 'error':
                    console.error('[useAgentStream] Error event:', event.data);
                    setIsStreaming(false);
                    setThinkingState(null);
                    persistThinkingState(null);

                    // Only set "unavailable" error if we haven't received any tokens yet
                    if (!hasReceivedToken) {
                      setError("unavailable");
                    } else {
                      console.warn('[useAgentStream] error after tokens received:', event.data);
                    }

                    toast.error('Agent error', {
                      description: event.data.message || 'Something went wrong.',
                    });
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
          };

        try {
          // eslint-disable-next-line no-constant-condition
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            // Process complete lines using indexOf for robustness
            let newlineIndex;
            while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
              const rawLine = buffer.slice(0, newlineIndex).trim();
              buffer = buffer.slice(newlineIndex + 1);

              if (!rawLine) continue;
              
              parseEventLine(rawLine);
            }
          }

          // Handle any trailing partial JSON at the end of the stream
          const tail = buffer.trim();
          if (tail.length > 0) {
            parseEventLine(tail);
          }
        } catch (error: any) {
          // Retry on transient stream errors
          if (
            error.name !== 'AbortError' &&
            isTransientError(error) &&
            retryIndexRef.current < RETRY_DELAYS_MS.length
          ) {
            const delay = RETRY_DELAYS_MS[retryIndexRef.current++];
            await new Promise((resolve) => setTimeout(resolve, delay));
            return runOnce();
          }

          if (error.name === 'AbortError') {
            console.log('[useAgentStream] Stream cancelled');
          } else {
            console.error('[useAgentStream] Stream error:', error);
            toast.error('Agent stream interrupted', {
              description: 'Please try again.',
            });
            setMessages((prev) => [
              ...prev,
              {
                role: 'assistant',
                content: `Connection interrupted: ${error.message}`,
                timestamp: Date.now(),
              },
            ]);
          }
        } finally {
          setIsStreaming(false);
          setThinkingState(null);
          persistThinkingState(null);
          readerRef.current = null;
          abortControllerRef.current = null;
        }
      };

      await runOnce();
    },
    [cancel, persistThinkingState]
  );

  return {
    messages,
    isStreaming,
    thinkingState,
    hasReceivedToken,
    error,
    sendMessage,
    cancel,
  };
}
