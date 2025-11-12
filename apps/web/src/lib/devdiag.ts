export type DevDiagPreset = "chat" | "embed" | "app" | "full";

export async function runDevDiag(url: string, preset: DevDiagPreset = "app", suppress?: string[]) {
  const res = await fetch("/api/ops/diag", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url, preset, suppress, tenant: "ledgermind" }),
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`DevDiag failed (${res.status}): ${txt}`);
  return JSON.parse(txt);
}

export async function diagHealth() {
  const res = await fetch("/api/ops/diag/health");
  return res.ok;
}
