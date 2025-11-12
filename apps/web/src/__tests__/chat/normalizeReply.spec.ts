import { describe, test, expect } from "vitest";
import { normalizeAssistantReply } from "@/features/chat/normalizeReply";
import type { MonthSummary } from "@/lib/formatters/finance";

describe("normalizeAssistantReply", () => {
  test("strips Hey prefix", () => {
    const out = normalizeAssistantReply(
      { role: "assistant", text: "Hey — here you go." },
      null
    );
    expect(out.text.toLowerCase().startsWith("hey")).toBe(false);
  });

  test("strips Hi prefix", () => {
    const out = normalizeAssistantReply(
      { role: "assistant", text: "Hi! Here's what I found." },
      null
    );
    expect(out.text).not.toMatch(/^hi[!\s]/i);
  });

  test("strips Hello prefix", () => {
    const out = normalizeAssistantReply(
      { role: "assistant", text: "Hello, let me help you with that." },
      null
    );
    expect(out.text).not.toMatch(/^hello[,\s]/i);
  });

  test("preserves text without Hey prefix", () => {
    const out = normalizeAssistantReply(
      { role: "assistant", text: "Here are your transactions." },
      null
    );
    expect(out.text).toMatch(/^Here are your transactions/);
  });

  test("renders quick recap with bullets", () => {
    const payload: MonthSummary = {
      month: "November 2025",
      month_id: "2025-11",
      income: 1500,
      spend: 1003.46,
      net: 496.54,
      topMerchant: { name: "HARRIS TEETER #0085", amount: 361.83 },
      unknown: {
        amount: 1003.46,
        count: 20,
        top: ["HARRIS TEETER #0085"],
      },
    };

    const out = normalizeAssistantReply(
      {
        role: "assistant",
        text: "raw",
        meta: { kind: "finance_quick_recap", payload },
      },
      null
    );

    expect(out.text).toMatch(/\*\*November 2025 — Quick recap\*\*/);
    expect(out.text).toMatch(/- \*\*Income:\*\*/);
    expect(out.text).toMatch(/- \*\*Spend:\*\*/);
    expect(out.text).toMatch(/- \*\*Net:\*\*/);
    expect(out.text).toMatch(/- \*\*Top merchant:\*\*/);
    expect(out.text).toMatch(/- \*\*Unknown:\*\*/);
  });

  test("renders quick recap with user name", () => {
    const payload: MonthSummary = {
      month: "November 2025",
      month_id: "2025-11",
      income: 1500,
      spend: 1003,
      net: 497,
    };

    const out = normalizeAssistantReply(
      {
        role: "assistant",
        text: "raw",
        meta: { kind: "finance_quick_recap", payload },
      },
      { email: "leo@example.com", name: "Leo", roles: [] }
    );

    expect(out.text).toMatch(/Leo, here's your/);
    expect(out.text).not.toMatch(/Hey/);
  });

  test("renders deep dive with categories", () => {
    const payload: MonthSummary = {
      month: "November 2025",
      month_id: "2025-11",
      income: 1500,
      spend: 1003,
      net: 497,
      categories: [
        { name: "Groceries", amount: 500 },
        { name: "Dining", amount: 300 },
      ],
      unknown: { amount: 203, count: 5 },
    };

    const out = normalizeAssistantReply(
      {
        role: "assistant",
        text: "raw",
        meta: { kind: "finance_deep_dive", payload },
      },
      null
    );

    expect(out.text).toMatch(/\*\*November 2025 — Deep dive\*\*/);
    expect(out.text).toMatch(/\*\*By category \(top 5\)\*\*/);
    expect(out.text).toMatch(/Groceries/);
    expect(out.text).toMatch(/Dining/);
  });

  test("adds helpful prompt for short replies without question", () => {
    const out = normalizeAssistantReply(
      { role: "assistant", text: "Done!" },
      null
    );

    expect(out.text).toMatch(/Anything else you want to check\?/);
  });

  test("does not add prompt if already ends with question", () => {
    const out = normalizeAssistantReply(
      { role: "assistant", text: "What would you like to do next?" },
      null
    );

    // Should not double-prompt
    expect(out.text).not.toMatch(/Anything else you want to check\?/);
  });

  test("does not modify user messages", () => {
    const out = normalizeAssistantReply(
      { role: "user", text: "Hey, show me my transactions" },
      null
    );

    expect(out.text).toBe("Hey, show me my transactions");
  });

  test("handles empty text gracefully", () => {
    const out = normalizeAssistantReply(
      { role: "assistant", text: "" },
      null
    );

    expect(out.text).toBeDefined();
  });
});
