import { describe, it, expect } from "vitest";
import { detectFinanceReply } from "@/features/chat/exportSmart";
import type { FinanceExport } from "@/types/finance-export";

type TestMessage = {
  role: string;
  text: string;
  ts: number;
  meta?: {
    mode?: string;
    ctxMonth?: string;
    monthSummary?: any;
  };
};

describe("smart export", () => {
  it("detects finance quick recap", () => {
    const msg: TestMessage = {
      role: "assistant",
      text: "## 2025-11 — Quick recap...",
      ts: Date.now(),
      meta: {
        mode: "finance_quick_recap",
        ctxMonth: "2025-11",
        monthSummary: {
          month: "2025-11",
          income: 1500,
          spend: 1003.46,
          net: 496.54,
          topMerchant: { name: "HARRIS TEETER", amount: 361.83 },
          unknown: { amount: 1003.46, count: 20, top: ["HARRIS TEETER"] },
          categories: [],
        },
      },
    };

    const res = detectFinanceReply([msg], "test-session-123");
    expect(res).toBeTruthy();
    expect(res?.kind).toBe("finance_quick_recap");
    expect((res as FinanceExport).month).toBe("2025-11");
    expect(res?.summary.income).toBe(1500);
    expect(res?.summary.spend).toBe(1003.46);
    expect(res?.source.session_id).toBe("test-session-123");
  });

  it("detects finance deep dive", () => {
    const msg: TestMessage = {
      role: "assistant",
      text: "## 2025-11 — Deep dive...",
      ts: Date.now(),
      meta: {
        mode: "finance_deep_dive",
        ctxMonth: "2025-11",
        monthSummary: {
          month: "2025-11",
          income: 1500,
          spend: 1003.46,
          net: 496.54,
          topMerchant: { name: "HARRIS TEETER", amount: 361.83 },
          unknown: { amount: 1003.46, count: 20 },
          categories: [
            { name: "Groceries", amount: 361.83 },
            { name: "Shopping", amount: 200 },
          ],
          spikes: [
            {
              date: "2025-11-15",
              merchant: "BIG PURCHASE",
              amount: 500,
            },
          ],
        },
      },
    };

    const res = detectFinanceReply([msg], "test-session-456");
    expect(res).toBeTruthy();
    expect(res?.kind).toBe("finance_deep_dive");
    expect(res?.categories).toBeDefined();
    expect(res?.categories?.length).toBe(2);
    expect(res?.spikes).toBeDefined();
    expect(res?.spikes?.length).toBe(1);
  });

  it("falls back to null for non-finance messages", () => {
    const msg: TestMessage = {
      role: "assistant",
      text: "hello",
      ts: Date.now(),
      meta: {},
    };
    const res = detectFinanceReply([msg], "test-session");
    expect(res).toBeNull();
  });

  it("returns null when no assistant messages", () => {
    const msgs: TestMessage[] = [
      { role: "user", text: "hi", ts: Date.now() },
    ];
    const res = detectFinanceReply(msgs, "test-session");
    expect(res).toBeNull();
  });

  it("prefers the latest finance reply", () => {
    const msgs: TestMessage[] = [
      {
        role: "assistant",
        text: "quick",
        ts: 1000,
        meta: {
          mode: "finance_quick_recap",
          ctxMonth: "2025-11",
          monthSummary: {
            month: "2025-11",
            income: 1500,
            spend: 1000,
            net: 500,
            topMerchant: { name: "TEST", amount: 100 },
            unknown: { amount: 0, count: 0 },
            categories: [],
          },
        },
      },
      {
        role: "assistant",
        text: "deep",
        ts: 2000,
        meta: {
          mode: "finance_deep_dive",
          ctxMonth: "2025-11",
          monthSummary: {
            month: "2025-11",
            income: 1500,
            spend: 1000,
            net: 500,
            topMerchant: { name: "TEST", amount: 100 },
            unknown: { amount: 0, count: 0 },
            categories: [{ name: "Test", amount: 100 }],
          },
        },
      },
    ];

    const res = detectFinanceReply(msgs, "test-session");
    expect(res?.kind).toBe("finance_deep_dive");
  });

  it("returns null if monthSummary data is missing", () => {
    const msg: TestMessage = {
      role: "assistant",
      text: "## 2025-11 — Quick recap...",
      ts: Date.now(),
      meta: {
        mode: "finance_quick_recap",
        ctxMonth: "2025-11",
        // monthSummary missing
      },
    };

    const res = detectFinanceReply([msg], "test-session");
    expect(res).toBeNull();
  });

  it("strips sensitive data and only includes session_id", () => {
    const msg: TestMessage = {
      role: "assistant",
      text: "recap",
      ts: 12345,
      meta: {
        mode: "finance_quick_recap",
        ctxMonth: "2025-11",
        monthSummary: {
          month: "2025-11",
          income: 1000,
          spend: 500,
          net: 500,
          topMerchant: { name: "TEST", amount: 100 },
          unknown: { amount: 0, count: 0 },
          categories: [],
        },
      },
    };

    const res = detectFinanceReply([msg], "secure-session");
    expect(res?.source.session_id).toBe("secure-session");
    expect(res?.source.message_id).toBe("12345");
    // Ensure no user email or cookies leaked
    expect(JSON.stringify(res)).not.toContain("email");
    expect(JSON.stringify(res)).not.toContain("cookie");
  });
});
