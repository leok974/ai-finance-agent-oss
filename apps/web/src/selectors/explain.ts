import type { ExplainResponse } from "@/lib/api";

/** Returns { cat, count, total } for the merchant history top category or null. */
export function selectTopMerchantCat(data: ExplainResponse | null) {
  if (!data) return null;
  const hist = (data as any)?.evidence?.similar;
  if (!hist || !Array.isArray(hist.by_category)) return null;
  const top = hist.by_category[0] as { category: string; count: number } | undefined;
  if (!top) return null;
  const total = Number(hist.total || 0) || 0;
  return { cat: top.category, count: top.count, total };
}
