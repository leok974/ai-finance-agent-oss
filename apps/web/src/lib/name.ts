export function getInitials(input?: string | null): string {
  if (!input) return "You";
  const cleaned = input.trim().replace(/\s+/g, " ");
  const base = cleaned.includes("@") ? cleaned.split("@")[0] : cleaned;
  const parts = base.split(" ").filter(Boolean);
  if (parts.length === 1) {
    const s = parts[0];
    return (s[0] || "Y").toUpperCase() + (s[1]?.toUpperCase() || "");
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
