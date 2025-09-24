import * as React from "react";
import { Button } from "@/components/ui/button";
import { analytics } from "@/lib/api";
import { useMonth } from "@/context/MonthContext";
import ForecastChart from "@/components/ForecastChart";

export function ForecastControls({ onLoad }: { onLoad: (data: any) => void }) {
  const { month } = useMonth();
  const [model, setModel] = React.useState<"auto" | "ema" | "sarimax">("auto");
  const [ci, setCi] = React.useState<0 | 0.8 | 0.9 | 0.95>(0.8);
  const [h, setH] = React.useState(3);

  return (
    <div className="flex gap-2 items-end">
      <label className="text-sm">
        Model<br />
        <select className="border rounded px-2 py-1" value={model} onChange={(e) => setModel(e.target.value as any)}>
          <option value="auto">Auto</option>
          <option value="sarimax">SARIMAX</option>
          <option value="ema">EMA</option>
        </select>
      </label>

      <label className="text-sm">
        CI<br />
        <select className="border rounded px-2 py-1" value={ci} onChange={(e) => setCi(Number(e.target.value) as any)}>
          <option value={0}>Off</option>
          <option value={0.8}>80%</option>
          <option value={0.9}>90%</option>
          <option value={0.95}>95%</option>
        </select>
      </label>

      <label className="text-sm">
        Horizon<br />
        <input
          className="border rounded px-2 py-1 w-16"
          type="number"
          min={1}
          max={12}
          value={h}
          onChange={(e) => setH(Math.max(1, Math.min(12, Number(e.target.value))))}
        />
      </label>

      <Button
        variant="pill-primary"
        className="ml-2 h-9 px-4"
        onClick={async () => {
          const data = await analytics.forecast(month, h, { model, ciLevel: ci });
          onLoad(data);
        }}
      >
        Run
      </Button>
    </div>
  );
}

// ForecastCard moved to separate component
