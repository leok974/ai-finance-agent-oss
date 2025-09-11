import { describe, it, expect } from "vitest";
import { getReplyText, type AgentChatResponse } from "@/lib/api";

describe("getReplyText", () => {
  it("prefers reply", () => {
    const r: AgentChatResponse = { reply: "a" } as any;
    expect(getReplyText(r)).toBe("a");
  });
  it("falls back to replied", () => {
    const r: AgentChatResponse = { replied: "b" } as any;
    expect(getReplyText(r)).toBe("b");
  });
  it("falls back to summary", () => {
    const r: AgentChatResponse = { summary: "c" } as any;
    expect(getReplyText(r)).toBe("c");
  });
  it("returns empty string when none present", () => {
    const r: AgentChatResponse = {} as any;
    expect(getReplyText(r)).toBe("");
  });
});
