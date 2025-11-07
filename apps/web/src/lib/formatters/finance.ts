/**
 * Finance formatters for clean, scannable chat replies
 * Produces markdown with bullets, bold currency, and action chips
 * No "Hey" greetings - optional name for natural personalization
 */

export type MonthSummary = {
  month: string; // "November 2025"
  month_id: string; // "2025-11"
  income: number;
  spend: number;
  net: number;
  topMerchant?: { name: string; amount: number };
  unknown?: { amount: number; count: number; top?: string[] };
  categories?: Array<{ name: string; amount: number; note?: string }>;
  spikes?: Array<{ date: string; merchant: string; amount: number; note?: string }>;
};

const fmt = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

const greet = (name?: string | null) =>
  name ? `${name}, here's your ` : `Here's your `; // no "Hey"

export const renderQuick = (s: MonthSummary, name?: string | null) => `
**${s.month} — Quick recap**

${greet(name)}snapshot:
- **Income:** ${fmt(s.income)}
- **Spend:** ${fmt(s.spend)}
- **Net:** **${s.net >= 0 ? "+" : ""}${fmt(s.net)}**
- **Top merchant:** ${s.topMerchant?.name ?? "—"} — **${s.topMerchant ? fmt(s.topMerchant.amount) : "—"}**
- **Unknown:** **${s.unknown ? fmt(s.unknown.amount) : fmt(0)}** across **${s.unknown?.count ?? 0}** txns

_Tip: Want a deeper breakdown by category or flag unusual spikes?_`.trim();

export const renderDeep = (s: MonthSummary, name?: string | null) => `
**${s.month} — Deep dive**

**By category (top 5)**
${
  (s.categories ?? [])
    .slice(0, 5)
    .map(
      (c, i) =>
        `${i + 1}. ${c.name} — **${fmt(c.amount)}**${c.note ? ` (${c.note})` : ""}`
    )
    .join("\n") || "—"
}

**Unknown**
- **${fmt(s.unknown?.amount ?? 0)}** across **${s.unknown?.count ?? 0}** txns
${
  s.unknown?.top?.length
    ? `  → Top contributors: ${s.unknown.top.slice(0, 3).join(", ")}`
    : ""
}

${
  (s.spikes?.length ?? 0)
    ? `**Spikes & notes**\n` +
      s.spikes!
        .map(
          (x) =>
            `- ${x.date}: ${x.merchant} — **${fmt(x.amount)}**${x.note ? ` (${x.note})` : ""}`
        )
        .join("\n")
    : ""
}

**Next actions**
- [Categorize unknowns]  [Show spikes]  [Top merchants detail]  [Budget check]`.trim();
