// src/utils/format.ts
export function money(n: number | string | null | undefined, c = "USD") {
  if (n == null || n === "") return "–";
  const v = typeof n === "string" ? Number(n) : n;
  if (!isFinite(v)) return "–";
  return new Intl.NumberFormat(undefined, { style: "currency", currency: c, maximumFractionDigits: 2 }).format(v);
}
export const shortDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString() : "—";
