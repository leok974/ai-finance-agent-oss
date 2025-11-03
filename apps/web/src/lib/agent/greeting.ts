// apps/web/src/lib/agent/greeting.ts
import type { MonthSummary, MerchantsResponse } from '@/lib/api.types';

export type AgentGreetingCtx = {
  // Human-friendly month label, e.g. "August 2025"
  monthLabel?: string;
  // Total outflows for the month, in cents (preferred) or number in dollars
  totalOutCents?: number;
  totalOut?: number; // fallback if cents not available
  // Top merchant name for the month
  topMerchant?: string;
  // Count of unique merchants
  merchantsN?: number;
  // Count of anomalies this month
  anomaliesN?: number;
};

/**
 * Build greeting context from typed API responses
 */
export function buildGreetingCtxFromAPI(
  summary?: MonthSummary,
  merchants?: MerchantsResponse
): AgentGreetingCtx {
  return {
    monthLabel: summary?.label ?? summary?.month,
    totalOutCents: summary?.total_out_cents,
    totalOut: summary?.total_out,
    topMerchant: merchants?.top_merchants?.[0]?.merchant,
    merchantsN: merchants?.merchants_count,
    anomaliesN: summary?.anomalies_count,
  };
}

const currencyFmt = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" });
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

function fmtMoney(ctx: AgentGreetingCtx): string | undefined {
  if (typeof ctx.totalOutCents === "number") return currencyFmt.format(ctx.totalOutCents / 100);
  if (typeof ctx.totalOut === "number") return currencyFmt.format(ctx.totalOut);
  return undefined;
}

/**
 * Build a conversational, dynamic greeting using whatever data is available.
 * Safe defaults ensure it still reads naturally when data is missing.
 */
export function buildAgentGreeting(ctx: AgentGreetingCtx): string {
  const monthPart = ctx.monthLabel ? `In ${ctx.monthLabel}, ` : "";
  const total = fmtMoney(ctx);
  const spendPart = total ? `you spent ${total}. ` : `your spending looks steady so far. `;

  // Skip merchant mention if none available
  let merchantPart = "";
  if (ctx.topMerchant && typeof ctx.merchantsN === "number") {
    merchantPart = `Top merchant was ${ctx.topMerchant} across ${ctx.merchantsN} ${plural(ctx.merchantsN, "place", "places")}. `;
  } else if (ctx.topMerchant) {
    merchantPart = `Top merchant was ${ctx.topMerchant}. `;
  } else if (typeof ctx.merchantsN === "number" && ctx.merchantsN > 0) {
    merchantPart = `You shopped at ${ctx.merchantsN} ${plural(ctx.merchantsN, "place", "places")}. `;
  }

  const anoms =
    typeof ctx.anomaliesN === "number" && ctx.anomaliesN > 0
      ? `I also spotted ${ctx.anomaliesN} unusual ${plural(ctx.anomaliesN, "charge", "charges")}. `
      : "";

  // Smart CTA based on spend state
  const totalCents = ctx.totalOutCents ?? (ctx.totalOut ? ctx.totalOut * 100 : undefined);
  const cta =
    totalCents === 0
      ? "Want me to set a starting budget or import last month's spend?"
      : "Want a quick recap, check something specific, or set a rule so next month's smarter?";

  return `Hey! 👋 ${monthPart}${spendPart}${merchantPart}${anoms}${cta}`.replace(/\s+/g, " ").trim();
}

/** Short/snappy variant if you ever want it */
export function buildAgentGreetingShort(ctx: AgentGreetingCtx): string {
  const total = fmtMoney(ctx);
  const parts: string[] = ["Hey!"];
  if (ctx.monthLabel && total) parts.push(`${ctx.monthLabel} spend: ${total}.`);
  else if (ctx.monthLabel) parts.push(`${ctx.monthLabel} is loading.`);
  if (ctx.topMerchant) parts.push(`Top merchant: ${ctx.topMerchant}.`);
  if (typeof ctx.anomaliesN === "number" && ctx.anomaliesN > 0)
    parts.push(`Spotted ${ctx.anomaliesN} ${plural(ctx.anomaliesN, "anomaly", "anomalies")}.`);
  parts.push("Recap, lookup, or add a rule?");
  return parts.join(" ");
}
