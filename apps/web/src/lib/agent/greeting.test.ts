import { describe, it, expect } from "vitest";
import { buildAgentGreeting, buildAgentGreetingShort, buildGreetingCtxFromAPI } from "./greeting";

describe("buildAgentGreeting", () => {
  it("renders full variant when all fields present", () => {
    const msg = buildAgentGreeting({
      monthLabel: "August 2025",
      totalOutCents: 60800,
      topMerchant: "Whole Foods",
      merchantsN: 9,
      anomaliesN: 2,
    });
    expect(msg).toMatch(/In August 2025/);
    expect(msg).toMatch(/\$608\.00/);
    expect(msg).toMatch(/Top merchant was Whole Foods/);
    expect(msg).toMatch(/across 9 places/);
    expect(msg).toMatch(/spotted 2 unusual charges/);
  });

  it("degrades gracefully when data is missing", () => {
    const msg = buildAgentGreeting({});
    expect(msg).toMatch(/Hey!/);
    expect(msg).toMatch(/spending looks steady/i);
  });

  it("shows budget CTA when spend is zero", () => {
    const msg = buildAgentGreeting({
      totalOutCents: 0,
    });
    expect(msg).toMatch(/set a starting budget or import last month's spend/i);
  });

  it("shows normal CTA when spend is non-zero", () => {
    const msg = buildAgentGreeting({
      totalOutCents: 10000,
    });
    expect(msg).toMatch(/quick recap, check something specific/i);
    expect(msg).not.toMatch(/starting budget/i);
  });

  it("skips merchant mention when merchantsN is 0", () => {
    const msg = buildAgentGreeting({
      merchantsN: 0,
    });
    expect(msg).not.toMatch(/merchant/i);
    expect(msg).not.toMatch(/shopped at/i);
  });

  it("handles single merchant correctly", () => {
    const msg = buildAgentGreeting({
      topMerchant: "Amazon",
      merchantsN: 1,
    });
    expect(msg).toMatch(/across 1 place/);
    expect(msg).not.toMatch(/places/);
  });

  it("handles single anomaly correctly", () => {
    const msg = buildAgentGreeting({
      anomaliesN: 1,
    });
    expect(msg).toMatch(/1 unusual charge/);
    expect(msg).not.toMatch(/charges/);
  });

  it("formats total from cents", () => {
    const msg = buildAgentGreeting({
      totalOutCents: 123456,
    });
    expect(msg).toMatch(/\$1,234\.56/);
  });

  it("formats total from dollars as fallback", () => {
    const msg = buildAgentGreeting({
      totalOut: 1234.56,
    });
    expect(msg).toMatch(/\$1,234\.56/);
  });

  it("prefers cents over dollars when both present", () => {
    const msg = buildAgentGreeting({
      totalOutCents: 100,
      totalOut: 999,
    });
    expect(msg).toMatch(/\$1\.00/);
    expect(msg).not.toMatch(/\$999/);
  });
});

describe("buildGreetingCtxFromAPI", () => {
  it("extracts data from typed API responses", () => {
    const ctx = buildGreetingCtxFromAPI(
      {
        label: "August 2025",
        month: "2025-08",
        total_out_cents: 60800,
        anomalies_count: 2,
      },
      {
        top_merchants: [{ merchant: "Whole Foods", spend: 200 }],
        merchants_count: 9,
      }
    );

    expect(ctx.monthLabel).toBe("August 2025");
    expect(ctx.totalOutCents).toBe(60800);
    expect(ctx.topMerchant).toBe("Whole Foods");
    expect(ctx.merchantsN).toBe(9);
    expect(ctx.anomaliesN).toBe(2);
  });

  it("handles missing summary gracefully", () => {
    const ctx = buildGreetingCtxFromAPI(undefined, {
      top_merchants: [{ merchant: "Amazon" }],
      merchants_count: 5,
    });

    expect(ctx.monthLabel).toBeUndefined();
    expect(ctx.topMerchant).toBe("Amazon");
    expect(ctx.merchantsN).toBe(5);
  });

  it("handles missing merchants gracefully", () => {
    const ctx = buildGreetingCtxFromAPI(
      {
        label: "August 2025",
        month: "2025-08",
        total_out_cents: 60800,
      },
      undefined
    );

    expect(ctx.monthLabel).toBe("August 2025");
    expect(ctx.totalOutCents).toBe(60800);
    expect(ctx.topMerchant).toBeUndefined();
  });

  it("handles completely empty responses", () => {
    const ctx = buildGreetingCtxFromAPI(undefined, undefined);

    expect(ctx.monthLabel).toBeUndefined();
    expect(ctx.totalOutCents).toBeUndefined();
    expect(ctx.topMerchant).toBeUndefined();
  });
});

describe("buildAgentGreetingShort", () => {
  it("renders short variant with all fields", () => {
    const msg = buildAgentGreetingShort({
      monthLabel: "August 2025",
      totalOutCents: 60800,
      topMerchant: "Whole Foods",
      anomaliesN: 2,
    });
    expect(msg).toMatch(/Hey!/);
    expect(msg).toMatch(/August 2025 spend: \$608\.00/);
    expect(msg).toMatch(/Top merchant: Whole Foods/);
    expect(msg).toMatch(/Spotted 2 anomalies/);
  });

  it("degrades gracefully when data is missing", () => {
    const msg = buildAgentGreetingShort({});
    expect(msg).toMatch(/Hey!/);
    expect(msg).toMatch(/Recap, lookup, or add a rule/);
  });

  it("handles single anomaly correctly", () => {
    const msg = buildAgentGreetingShort({
      anomaliesN: 1,
    });
    expect(msg).toMatch(/Spotted 1 anomaly\./);
    expect(msg).not.toMatch(/anomalies/);
  });
});
