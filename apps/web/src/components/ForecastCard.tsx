import * as React from "react";
import { Button } from "@/components/ui/button";
import { analytics } from "@/lib/api";
import { useMonth } from "@/context/MonthContext";
import ForecastChart from "@/components/ForecastChart";
import ExplainButton from "@/components/ExplainButton";

type ModelOpt = "auto" | "ema" | "sarimax";
type CiOpt = 0 | 0.8 | 0.9 | 0.95;

export default function ForecastCard({ className = "" }: { className?: string }) {
  const { month } = useMonth();
  const [data, setData] = React.useState<any>(null);
  const [busy, setBusy] = React.useState(false);
  const lastAutoRunMonth = React.useRef<string | null>(null);

  // Controls
  const [model, setModel] = React.useState<ModelOpt>("auto");
  const [ci, setCi] = React.useState<CiOpt>(0.8);
  const [horizon, setHorizon] = React.useState(3);

  async function run(overrides?: { model?: ModelOpt; ci?: CiOpt; horizon?: number }) {
    setBusy(true);
    try {
      const m = overrides?.model ?? model;
      const c = overrides?.ci ?? ci;
      const h = overrides?.horizon ?? horizon;
      const res = await analytics.forecast(month, h, {
        model: m,
        ciLevel: c,
      });
      setData(res);
    } finally {
      setBusy(false);
    }
  }

  // Auto-run once when a valid month is available and no data yet
  React.useEffect(() => {
    if (!month || data || busy) return;
    if (lastAutoRunMonth.current === month) return;
    lastAutoRunMonth.current = month;
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  return (
    <section
      data-help-id={month}
      data-help-key="card.forecast"
      className={[
        "help-spot",
        "rounded-2xl border bg-card/50 shadow-sm p-4 md:p-5",
        "overflow-visible",
        className,
      ].join(" ")}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Forecast</h3>
          {data?.model && (
            <span className="text-[10px] px-2 py-0.5 rounded-full border text-muted-foreground">
              Model: {String(data.model).toUpperCase()}
              {data?.ci_alpha != null ? ` • CI ${((1 - data.ci_alpha) * 100) | 0}%` : ""}
            </span>
          )}
        </div>
        {/* Help for this card */}
        <ExplainButton k="charts.spending_trends" month={month} />
      </div>

      {/* Controls */}
      <div className="mt-3 grid grid-cols-2 md:grid-cols-[auto_auto_auto_auto_1fr] items-end gap-2">
        <label className="text-xs text-muted-foreground grid">
          <span className="mb-1">Model</span>
          <select
            className="border rounded-md px-2 py-1 bg-background"
            value={model}
            onChange={(e) => setModel(e.target.value as ModelOpt)}
          >
            <option value="auto">Auto</option>
            <option value="sarimax">SARIMAX</option>
            <option value="ema">EMA</option>
          </select>
        </label>

        <label className="text-xs text-muted-foreground grid">
          <span className="mb-1">CI</span>
          <select
            className="border rounded-md px-2 py-1 bg-background"
            value={ci}
            onChange={(e) => setCi(Number(e.target.value) as CiOpt)}
          >
            <option value={0}>Off</option>
            <option value={0.8}>80%</option>
            <option value={0.9}>90%</option>
            <option value={0.95}>95%</option>
          </select>
        </label>

        <label className="text-xs text-muted-foreground grid">
          <span className="mb-1">Horizon</span>
          <input
            className="border rounded-md px-2 py-1 bg-background w-20"
            type="number"
            min={1}
            max={12}
            value={horizon}
            onChange={(e) => setHorizon(Math.max(1, Math.min(12, Number(e.target.value) || 1)))}
          />
        </label>

        <div className="self-end">
          <Button variant="pill-primary" className="h-9 px-4 ml-2" onClick={() => run()} disabled={busy} aria-busy={busy}>
            {busy ? "Running…" : "Run"}
          </Button>
          <Button
            type="button"
            variant="pill-outline"
            className="ml-2 align-middle text-xs"
            onClick={() => {
              setModel("auto");
              setCi(0.8);
              setHorizon(3);
              setData(null);
              void run({ model: "auto", ci: 0.8, horizon: 3 });
            }}
            aria-label="Reset forecast options"
          >
            Reset
          </Button>
        </div>

        {/* subtle hint only when empty */}
        {!data && (
          <div className="hidden md:block text-xs text-muted-foreground pl-2 self-center">
            Run a forecast for <span className="font-medium">{month}</span>.
          </div>
        )}
      </div>

      {/* Chart / states */}
      <div className="mt-4">
        {busy && (
          <div className="h-64 grid place-items-center rounded-lg border bg-muted/20">
            <div className="text-sm text-muted-foreground">Calculating forecast…</div>
          </div>
        )}

        {!busy && !data && (
          <div className="h-64 grid place-items-center rounded-lg border bg-muted/10">
            <div className="text-sm text-muted-foreground">No forecast yet. Choose options and click Run.</div>
          </div>
        )}

        {!busy && data && data.ok === false && (
          <div className="h-64 grid place-items-center rounded-lg border bg-muted/10">
            <div className="text-sm">
              {data.reason === "not_enough_history"
                ? "Not enough history to forecast yet."
                : "Forecast unavailable."}
            </div>
          </div>
        )}

        {!busy && data && data.ok !== false && (
          <div className="rounded-lg border p-2">
            <ForecastChart data={data} />
          </div>
        )}
      </div>
    </section>
  );
}
