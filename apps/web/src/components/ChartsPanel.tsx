import React, { useEffect, useMemo, useState } from "react";
import Card from "./Card";
import EmptyState from "./EmptyState";
import * as RC from "recharts";
import {
  getMonthSummary,
  getMonthMerchants,
  getMonthFlows,
  getSpendingTrends,
} from "../lib/api";

// Cast so TS treats them as FCs (safe for now)
const ResponsiveContainer = RC.ResponsiveContainer as unknown as React.FC<any>;
const CartesianGrid = RC.CartesianGrid as unknown as React.FC<any>;
const XAxis = RC.XAxis as unknown as React.FC<any>;
const YAxis = RC.YAxis as unknown as React.FC<any>;
const Tooltip = RC.Tooltip as unknown as React.FC<any>;
const Legend = RC.Legend as unknown as React.FC<any>;
const BarChart = RC.BarChart as unknown as React.FC<any>;
const Bar = RC.Bar as unknown as React.FC<any>;
const LineChart = RC.LineChart as unknown as React.FC<any>;
const Line = RC.Line as unknown as React.FC<any>;

interface Props {
  /** Required: charts endpoints require month */
  month: string;
  refreshKey?: number;
}

const currency = (n: number) =>
  n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const ChartsPanel: React.FC<Props> = ({ month, refreshKey = 0 }) => {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<any | null>(null);
  const [merchants, setMerchants] = useState<any | null>(null);
  const [flows, setFlows] = useState<any | null>(null);
  const [trends, setTrends] = useState<any | null>(null);
  const [empty, setEmpty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // resolvedMonth prefers server-returned month, falls back to prop
  const resolvedMonth = summary?.month ?? month;

  useEffect(() => {
    let alive = true;
    async function run() {
      setLoading(true);
      setError(null);
      setEmpty(false);
      try {
        const [s, m, f, t] = await Promise.all([
          getMonthSummary(month),
          getMonthMerchants(month),
          getMonthFlows(month),
          getSpendingTrends(6),
        ]);
        if (!alive) return;
        // consider backend-empty cases: nulls from 400 handler, or objects with month: null
        const isEmpty = (!s && !m && !f) || ((s?.month ?? null) === null && (m?.month ?? null) === null && (f?.month ?? null) === null);
        if (isEmpty) {
          setEmpty(true);
          setSummary(null);
          setMerchants(null);
          setFlows(null);
          setTrends(t ?? null);
        } else {
          setSummary(s);
          setMerchants(m);
          setFlows(f);
          setTrends(t);
        }
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message ?? String(e));
      } finally {
        if (alive) setLoading(false);
      }
    }
    run();
    return () => {
      alive = false;
    };
  }, [month, refreshKey]);

  const categoriesData = useMemo(() => summary?.categories ?? [], [summary]);
  const merchantsData = useMemo(() => merchants?.merchants ?? [], [merchants]);
  const flowsData = useMemo(() => flows?.series ?? [], [flows]);
  const trendsData = useMemo(
    () => (trends?.trends ?? []).map((t: any) => ({ month: t.month, spent: t.spent ?? t.spending ?? 0 })),
    [trends]
  );

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {empty && !error && (
        <div className="lg:col-span-2">
          <EmptyState title="No transactions yet" note="Once you upload, charts will populate automatically." />
        </div>
      )}
  <Card title={`Overview — ${resolvedMonth}`}>
        {loading && <p className="text-sm text-gray-400">Loading charts…</p>}
        {error && !empty && <p className="text-sm text-rose-300">Error: {error}</p>}
        {!loading && !error && summary && (
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div className="rounded-xl bg-gray-800/50 p-3">
              <div className="text-gray-400">Total Spend</div>
              <div className="mt-1 text-lg font-semibold text-rose-300">
                {currency(summary.total_spend || 0)}
              </div>
            </div>
            <div className="rounded-xl bg-gray-800/50 p-3">
              <div className="text-gray-400">Total Income</div>
              <div className="mt-1 text-lg font-semibold text-emerald-300">
                {currency(summary.total_income || 0)}
              </div>
            </div>
            <div className="rounded-xl bg-gray-800/50 p-3">
              <div className="text-gray-400">Net</div>
              <div className="mt-1 text-lg font-semibold text-indigo-300">
                {currency(summary.net || 0)}
              </div>
            </div>
          </div>
        )}
      </Card>

      <Card title="Top Categories (expenses)">
        {loading && <p className="text-sm text-gray-400">Loading…</p>}
        {!loading && categoriesData.length === 0 && (
          <p className="text-sm text-gray-400">No category data.</p>
        )}
        {!loading && categoriesData.length > 0 && (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoriesData}>
                <CartesianGrid stroke="var(--grid-line)" />
                <XAxis dataKey="name" tick={{ fill: "var(--text-muted)" }} stroke="var(--border-subtle)" />
                <YAxis tick={{ fill: "var(--text-muted)" }} stroke="var(--border-subtle)" />
                <Tooltip
                  contentStyle={{
                    background: "var(--tooltip-bg)",
                    borderColor: "var(--tooltip-br)",
                    color: "var(--tooltip-text)",
                  }}
                />
                <Legend />
                <Bar dataKey="amount" name="Spend" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card title="Top Merchants (expenses)">
        {loading && <p className="text-sm text-gray-400">Loading…</p>}
        {!loading && merchantsData.length === 0 && (
          <p className="text-sm text-gray-400">No merchant data.</p>
        )}
        {!loading && merchantsData.length > 0 && (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={merchantsData}>
                <CartesianGrid stroke="var(--grid-line)" />
                <XAxis dataKey="merchant" tick={{ fill: "var(--text-muted)" }} stroke="var(--border-subtle)" />
                <YAxis tick={{ fill: "var(--text-muted)" }} stroke="var(--border-subtle)" />
                <Tooltip
                  contentStyle={{
                    background: "var(--tooltip-bg)",
                    borderColor: "var(--tooltip-br)",
                    color: "var(--tooltip-text)",
                  }}
                />
                <Legend />
                <Bar dataKey="amount" name="Spend" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card title="Daily Flows">
        {loading && <p className="text-sm text-gray-400">Loading…</p>}
        {!loading && flowsData.length === 0 && (
          <p className="text-sm text-gray-400">No flow data.</p>
        )}
        {!loading && flowsData.length > 0 && (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={flowsData}>
                <CartesianGrid stroke="var(--grid-line)" />
                <XAxis dataKey="date" tick={{ fill: "var(--text-muted)" }} stroke="var(--border-subtle)" />
                <YAxis tick={{ fill: "var(--text-muted)" }} stroke="var(--border-subtle)" />
                <Tooltip
                  contentStyle={{
                    background: "var(--tooltip-bg)",
                    borderColor: "var(--tooltip-br)",
                    color: "var(--tooltip-text)",
                  }}
                />
                <Legend />
                <Line type="monotone" dataKey="in" name="In" />
                <Line type="monotone" dataKey="out" name="Out" />
                <Line type="monotone" dataKey="net" name="Net" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card title="Spending Trends (last 6 months)">
        {loading && <p className="text-sm text-gray-400">Loading…</p>}
        {!loading && trendsData.length === 0 && (
          <p className="text-sm text-gray-400">No historical data.</p>
        )}
        {!loading && trendsData.length > 0 && (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendsData}>
                <CartesianGrid stroke="var(--grid-line)" />
                <XAxis dataKey="month" tick={{ fill: "var(--text-muted)" }} stroke="var(--border-subtle)" />
                <YAxis tick={{ fill: "var(--text-muted)" }} stroke="var(--border-subtle)" />
                <Tooltip
                  contentStyle={{
                    background: "var(--tooltip-bg)",
                    borderColor: "var(--tooltip-br)",
                    color: "var(--tooltip-text)",
                  }}
                />
                <Legend />
                <Line type="monotone" dataKey="spent" name="Spent" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>
    </div>
  );
};

export default ChartsPanel;
