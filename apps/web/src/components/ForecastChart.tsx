import * as React from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

type ForecastItem = {
  t: number;
  inflows: number;
  outflows: number;
  net: number;
  net_ci?: [number, number];
};

type Props = {
  data: { forecast?: ForecastItem[]; model?: string; ci_alpha?: number } | null;
};

function fmtUSD(n?: number) {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export default function ForecastChart({ data }: Props) {
  const items = data?.forecast ?? [];

  // Palette (match existing charts)
  const NET = "#60a5fa";      // blue-400
  const INFLOWS = "#22c55e";  // green-500
  const OUTFLOWS = "#ef4444"; // red-500
  const CI_FILL = "rgba(96,165,250,0.22)"; // NET with ~22% opacity

  const points = items.map((d) => {
    const ciLow = d.net_ci ? d.net_ci[0] : null;
    const ciHigh = d.net_ci ? d.net_ci[1] : null;
    const ciSpan = d.net_ci ? Math.max(0, (ciHigh ?? 0) - (ciLow ?? 0)) : null;
    return {
      x: `M+${d.t}`,
      inflows: d.inflows,
      outflows: d.outflows,
      net: d.net,
      ciLow,
      ciSpan,
    } as any;
  });

  const hasCI = points.some((p: any) => p.ciLow != null && p.ciSpan != null);
  const ciLabel = data?.ci_alpha != null ? `Net CI (${Math.round((1 - data.ci_alpha) * 100)}%)` : "Net CI";

  const LegendMini: React.FC = () => (
    <div className="text-xs flex items-center gap-4" style={{ color: "var(--text-muted)" }}>
      <span className="flex items-center gap-1">
        <span style={{ display: 'inline-block', width: 16, height: 2, background: NET, marginTop: 3 }} /> Net
      </span>
      <span className="flex items-center gap-1">
        <span style={{ display: 'inline-block', width: 16, height: 2, background: INFLOWS, marginTop: 3 }} /> Inflows
      </span>
      <span className="flex items-center gap-1">
        <span style={{ display: 'inline-block', width: 16, height: 2, background: OUTFLOWS, marginTop: 3 }} /> Outflows
      </span>
      {hasCI && (
        <span className="flex items-center gap-1">
          <span style={{ display: 'inline-block', width: 14, height: 10, background: CI_FILL, border: `1px solid ${NET}55`, borderRadius: 2 }} />
          {ciLabel}
        </span>
      )}
    </div>
  );

  return (
    <div className="w-full h-64">
      <ResponsiveContainer>
        <ComposedChart data={points} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="x" />
          <YAxis tickFormatter={(v) => fmtUSD(v)} width={72} />
          <Tooltip
            cursor={{ strokeOpacity: 0.25 }}
            contentStyle={{
              backgroundColor: "rgba(0, 0, 0, 0.9)",
              borderRadius: 8,
              border: "1px solid rgba(148, 163, 184, 0.4)",
              padding: "8px 10px",
              boxShadow: "0 10px 25px rgba(0,0,0,0.6)",
            }}
            labelStyle={{
              color: "#e5e7eb",
              fontSize: 12,
              marginBottom: 4,
            }}
            itemStyle={{
              color: "#e5e7eb",
              fontSize: 12,
            }}
            formatter={(val: any, name: string) => [fmtUSD(Number(val)), name]}
            labelFormatter={(l) => `Horizon ${l}`}
          />
          <Legend content={<LegendMini />} />

          {hasCI && (
            <>
              <Area dataKey="ciLow" stackId="ci" stroke="none" fill="transparent" isAnimationActive={false} name="" />
              <Area
                dataKey="ciSpan"
                stackId="ci"
                stroke="none"
                fill={CI_FILL}
                isAnimationActive={false}
                name={ciLabel}
              />
            </>
          )}

          <Line type="monotone" dataKey="net" stroke={NET} strokeWidth={2} dot={{ r: 2 }} name="Net" />
          <Line type="monotone" dataKey="inflows" stroke={INFLOWS} strokeDasharray="4 2" dot={false} name="Inflows" />
          <Line type="monotone" dataKey="outflows" stroke={OUTFLOWS} strokeDasharray="4 2" dot={false} name="Outflows" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
