/**
 * Feature flag for streaming chat UI
 *
 * When enabled, assistant messages stream token-by-token into the chat panel
 * with a blinking cursor, using the /agui/chat SSE endpoint.
 *
 * Set VITE_CHAT_STREAMING_ENABLED=1 in .env.development to enable.
 */
export const CHAT_STREAMING_ENABLED =
  import.meta.env.VITE_CHAT_STREAMING_ENABLED === "1";
