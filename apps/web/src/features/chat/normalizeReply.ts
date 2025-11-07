/**
 * Reply normalizer - strip "Hey", apply finance templates, add light variety
 */
import { renderQuick, renderDeep, type MonthSummary } from "@/lib/formatters/finance";
import type { CurrentUser } from "@/state/auth";

const HEY_PREFIX = /^\s*(hey|hi|hello|greetings)[\s—,!:]*\s*/i;

export type ChatMessage = {
  role: "assistant" | "user";
  text: string;
  meta?: {
    kind?: string;
    month?: string;
    payload?: MonthSummary;
  };
};

/**
 * Normalize assistant replies:
 * 1. Use templates for finance summaries
 * 2. Strip boilerplate greeting ("Hey", "Hi", etc.)
 * 3. Add light variety with helpful prompts
 */
export function normalizeAssistantReply(
  msg: ChatMessage,
  user?: CurrentUser | null
): ChatMessage {
  if (msg.role !== "assistant") return msg;

  const name = user?.name ?? null;

  // 1) Use templates for finance summaries
  const kind = msg.meta?.kind;
  if (kind === "finance_quick_recap" && msg.meta?.payload) {
    return { ...msg, text: renderQuick(msg.meta.payload, name) };
  }
  if (kind === "finance_deep_dive" && msg.meta?.payload) {
    return { ...msg, text: renderDeep(msg.meta.payload, name) };
  }

  // 2) Otherwise, strip boilerplate greeting
  let text = msg.text.replace(HEY_PREFIX, "");

  // 3) Light variety: end with a short prompt only if it's not already a question
  if (!/[?]\s*$/.test(text) && text.length < 400) {
    text += "\n\n_Anything else you want to check?_";
  }

  return { ...msg, text };
}
