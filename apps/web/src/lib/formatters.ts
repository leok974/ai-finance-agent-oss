// Robust helpers to normalize varying payload shapes
const asArray = (x: any): any[] =>
  Array.isArray(x) ? x :
  Array.isArray(x?.list) ? x.list :
  Array.isArray(x?.items) ? x.items :
  Array.isArray(x?.data) ? x.data :
  Array.isArray(x?.rows) ? x.rows :
  Array.isArray(x?.merchants) ? x.merchants :
  (x && typeof x === "object") ? Object.values(x) : [];

const asSeries = (input: any): Array<{ month: string; spend: number }> => {
  if (Array.isArray(input)) return input as any;
  if (Array.isArray(input?.trends)) return input.trends as any;
  if (Array.isArray(input?.series)) return input.series as any;
  if (Array.isArray(input?.data)) return input.data as any;
  if (input && typeof input === "object") {
    return Object.entries(input).map(([k, v]: [string, any]) => ({
      month: k,
      spend: Number(typeof v === "object" ? (v?.spend ?? v?.spending ?? v?.amount ?? v?.value ?? 0) : v),
    }));
  }
  return [];
};

export const fmtMonthSummary = (m: string, d: any) => {
  const income = d?.income_total ?? d?.total_inflows ?? d?.income ?? 0;
  const spend = d?.spend_total ?? d?.total_outflows ?? d?.spend ?? 0;
  const net = d?.net ?? (Number(income) - Math.abs(Number(spend)));
  const catsSrc = d?.top_categories ?? d?.categories;
  const cats = asArray(catsSrc).slice(0, 5);
  const catStr = cats
    .map((c: any) => `${c?.name ?? c?.category}:${c?.amount ?? c?.total ?? c?.spend ?? 0}`)
    .join(", ");
  return `Summarize ${m} for a household budget. income=${income}, spend=${spend}, net=${net}. Top categories: ${catStr}.`;
};

export const fmtTopMerchants = (m: string, raw: any) => {
  const arr = asArray(raw).map((x: any) => (x && typeof x === "object" ? x : { merchant: String(x), spend: 0 }));
  if (!arr.length) return `There are no top merchants for ${m}.`;
  const s = arr
    .slice(0, 10)
    .map((x: any, i: number) => `${i + 1}. ${x.merchant ?? x.name} $${x.spend ?? x.amount ?? x.total ?? 0}`)
    .join("; ");
  return `Summarize top merchants for ${m} in 3 bullets and one actionable tip: ${s}`;
};

export const fmtCashflow = (m: string, f: any) => {
  const inflow = f?.income_total ?? f?.income ?? 0;
  const outflow = f?.spend_total ?? f?.expense ?? f?.spend ?? 0;
  const buckets = asArray(f?.buckets ?? f?.top_categories)
    .map((b: any) => `${b?.name ?? b?.bucket ?? b?.category}:${b?.amount ?? b?.total ?? 0}`)
    .join(", ");
  return `Explain ${m} cashflow in two lines: inflows=${inflow}, outflows=${outflow}. Buckets: ${buckets}.`;
};

export const fmtTrends = (raw: any) => {
  const series = asSeries(raw);
  if (!series.length) return "There are no trend points for the selected period.";
  const points = series.map((p: any) => `${p.month}:${p.spend}`).join(", ");
  return `Describe the spending trend and call out spikes: ${points}`;
};
