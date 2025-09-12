// src/components/AgentResultRenderers.tsx
import React from "react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { InfoDot } from "./InfoDot";
import { money, shortDate } from "../utils/format";
import ExplainSignalDrawer from "./ExplainSignalDrawer";
import type {
  TransactionsSearchResult,
  CategorizeResult,
  BudgetSummaryResult,
  BudgetCheckResult,
  InsightSummaryResult,
  InsightsExpandedResult,
  MoMStat,
  ChartsSummaryResult,
  ChartsMerchantsResult,
  ChartsFlowsResult,
  ChartsTrendsResult,
  RulesTestResult,
  RulesApplyResult,
  Txn,
} from "../types/agentToolsResults";
import type { ToolKey } from "../types/agentTools";

/** ---------- Shared primitives ---------- */

function Card({
  title,
  children,
  right,
}: React.PropsWithChildren<{ title: React.ReactNode; right?: React.ReactNode }>) {
  return (
    <div className="rounded-2xl border border-[color:var(--border-subtle)] bg-[var(--bg-card)] shadow-sm p-4 text-[var(--text)]">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-[var(--text)]">{title}</h3>
        {right}
      </div>
      {children}
    </div>
  );
}

function T({ header, rows }: { header: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[color:var(--text-muted)] border-b" style={{ borderColor: "var(--border-subtle)" }}>
            {header.map((h) => (
              <th key={h} className="py-2 pr-4 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="text-[var(--text)]">
          {rows.map((r, i) => (
            <tr key={i} className="border-b last:border-b-0" style={{ borderColor: "var(--border-subtle)" }}>
              {r.map((c, j) => (
                <td key={j} className="py-2 pr-4 align-top">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** ---------- Transactions ---------- */

export function TransactionsSearchCard({ data }: { data: TransactionsSearchResult }) {
  const [open, setOpen] = React.useState(false);
  const [txnId, setTxnId] = React.useState<number | null>(null);
  const rows = (data.items ?? []).slice(0, 50).map((t: Txn) => [
    shortDate(t.date),
    t.merchant || "—",
    t.description || "—",
    t.category || "Unknown",
    <span className={Number(t.amount) < 0 ? "text-[var(--accent-bad)]" : "text-[var(--accent-good)]"}>
      {money(t.amount)}
    </span>,
    <button
      className="px-2 py-1 rounded-md border border-border hover:bg-accent/10"
      onClick={() => { const id = Number(t.id); if (!isNaN(id)) { setTxnId(id); setOpen(true); } }}
    >
      Explain
    </button>,
  ]);
  return (
    <Card title={`Transactions (${data.total ?? rows.length})`}>
      <T header={["Date", "Merchant", "Description", "Category", "Amount", ""]} rows={rows} />
      <ExplainSignalDrawer txnId={txnId} open={open} onOpenChange={setOpen} />
    </Card>
  );
}

export function CategorizeResultCard({ data }: { data: CategorizeResult }) {
  const rows = (data.updated ?? []).map((u) => [String(u.id), u.category]);
  return (
    <Card
      title="Categorize Result"
      right={<span className="text-xs text-[color:var(--text-muted)]">{rows.length} updated</span>}
    >
      <T header={["Txn ID", "New Category"]} rows={rows} />
      {data.skipped ? (
        <p className="mt-2 text-xs text-[color:var(--text-muted)]">
          {data.skipped} skipped (already labeled)
        </p>
      ) : null}
    </Card>
  );
}

/** ---------- Budget ---------- */

export function BudgetSummaryCard({ data }: { data: BudgetSummaryResult }) {
  const rows = (data.totals ?? []).map((x) => [x.category, money(x.budget ?? null), money(x.actual)]);
  return (
    <Card
      title={
        <div className="flex items-center gap-2">
          <span>Budget Summary {data.month ? `— ${data.month}` : ""}</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <InfoDot />
            </TooltipTrigger>
            <TooltipContent>
              Shows budgeted vs actual by category for the selected month.
            </TooltipContent>
          </Tooltip>
        </div>
      }
    >
      <T header={["Category", "Budget", "Actual"]} rows={rows} />
    </Card>
  );
}

export function BudgetCheckCard({ data }: { data: BudgetCheckResult }) {
  const rows = (data.utilization ?? []).map((x) => [
    x.category,
    money(x.budget ?? null),
    money(x.actual),
    `${Math.round((x.ratio ?? 0) * 100)}%`,
  ]);
  return (
    <Card title={`Budget Check ${data.month ? `— ${data.month}` : ""}`}>
      <T header={["Category", "Budget", "Actual", "Utilization"]} rows={rows} />
    </Card>
  );
}

/** ---------- Insights (Summary) ---------- */

export function InsightSummaryCard({ data }: { data: InsightSummaryResult }) {
  const [open, setOpen] = React.useState(false);
  const [txnId, setTxnId] = React.useState<number | null>(null);
  const topCats = (data.topCategories ?? []).slice(0, 5).map((c) => [c.category, money(c.amount)]);
  const topMerch = (data.topMerchants ?? []).slice(0, 5).map((m) => [m.merchant, money(m.amount)]);
  const large = (data.largeTransactions ?? []).slice(0, 5).map((t) => [
    shortDate(t.date),
    t.merchant || "—",
    t.category || "Unknown",
    money(t.amount),
    <button
      className="px-2 py-1 rounded-md border border-border hover:bg-accent/10"
      onClick={() => { const id = Number(t.id); if (!isNaN(id)) { setTxnId(id); setOpen(true); } }}
    >
      Explain
    </button>,
  ]);

  const income = data.summary?.income ?? 0;
  const spend = data.summary?.spend ?? 0; // negative
  const net = data.summary?.net ?? 0;

  return (
    <div className="grid md:grid-cols-2 gap-3">
      <Card
        title={
          <div className="flex items-center gap-2">
            <span>Summary {data.month ? `— ${data.month}` : ""}</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <InfoDot />
              </TooltipTrigger>
              <TooltipContent>
                Shows total income, spending, and net balance for the selected month.
              </TooltipContent>
            </Tooltip>
          </div>
        }
      >
        <div className="text-sm space-y-1">
          <div className="text-[color:var(--text-muted)]">Income</div>
          <div className="text-2xl font-semibold text-[var(--text-strong)]">{money(income)}</div>

          <div className="text-[color:var(--text-muted)] mt-2">Spend</div>
          <div className="text-2xl font-semibold text-[var(--text-strong)]">{money(Math.abs(spend))}</div>

          <div className="text-[color:var(--text-muted)] mt-2">Net</div>
          <div
            className={`text-2xl font-semibold ${
              net > 0
                ? "text-[var(--accent-good)]"
                : net < 0
                ? "text-[var(--accent-bad)]"
                : "text-[var(--text-strong)]"
            }`}
          >
            {money(net)}
          </div>

          {data.unknownSpend ? (
            <div className="mt-2 inline-flex items-center gap-1 badge-warn">
              Unknown spend: {money(Math.abs(data.unknownSpend.amount))} ({data.unknownSpend.count} txns)
            </div>
          ) : null}
        </div>
      </Card>

      <Card title="Top Categories">
        <T header={["Category", "Amount"]} rows={topCats} />
      </Card>

      <Card title="Top Merchants">
        <T header={["Merchant", "Amount"]} rows={topMerch} />
      </Card>

      <Card title="Large Transactions">
        <T header={["Date", "Merchant", "Category", "Amount", ""]} rows={large} />
        <ExplainSignalDrawer txnId={txnId} open={open} onOpenChange={setOpen} />
      </Card>
    </div>
  );
}

/** ---------- Charts ---------- */

export function ChartsSummaryCard({ data }: { data: ChartsSummaryResult }) {
  return (
    <Card
      title={
        <div className="flex items-center gap-2">
          <span>Chart Summary {data.month ? `— ${data.month}` : ""}</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <InfoDot />
            </TooltipTrigger>
            <TooltipContent>
              High‑level totals (income, spend, net) for the selected month.
            </TooltipContent>
          </Tooltip>
        </div>
      }
    >
      <div className="grid grid-cols-3 gap-3 text-sm">
        <div>
          <div className="text-[color:var(--text-muted)]">Income</div>
          <div className="font-semibold text-[var(--text-strong)]">{money(data.income)}</div>
        </div>
        <div>
          <div className="text-[color:var(--text-muted)]">Spend</div>
          <div className="font-semibold text-[var(--text-strong)]">{money(Math.abs(data.spend))}</div>
        </div>
        <div>
          <div className="text-[color:var(--text-muted)]">Net</div>
          <div className="font-semibold text-[var(--text-strong)]">{money(data.net)}</div>
        </div>
      </div>
    </Card>
  );
}

export function ChartsMerchantsCard({ data }: { data: ChartsMerchantsResult }) {
  const rows = (data.merchants ?? []).map((m) => [m.merchant, money(m.amount)]);
  return (
    <Card title={`Top Merchants ${data.month ? `— ${data.month}` : ""}`}>
      <T header={["Merchant", "Amount"]} rows={rows} />
    </Card>
  );
}

export function ChartsFlowsCard({ data }: { data: ChartsFlowsResult }) {
  const inflow = (data.inflow ?? []).map((x) => [x.name, money(x.amount)]);
  const outflow = (data.outflow ?? []).map((x) => [x.name, money(x.amount)]);
  return (
    <div className="grid md:grid-cols-2 gap-3">
      <Card title="Inflow">
        <T header={["Source", "Amount"]} rows={inflow} />
      </Card>
      <Card title="Outflow">
        <T header={["Sink", "Amount"]} rows={outflow} />
      </Card>
    </div>
  );
}

export function ChartsTrendsCard({ data }: { data: ChartsTrendsResult }) {
  const rows = (data.series ?? []).map((s) => [s.month, money(s.income), money(Math.abs(s.spend)), money(s.net)]);
  return <Card title="Spending Trends">
    <T header={["Month", "Income", "Spend", "Net"]} rows={rows} />
  </Card>;
}

/** ---------- Rules ---------- */

export function RulesTestCard({ data }: { data: RulesTestResult }) {
  const rows = (data.matched ?? []).slice(0, 50).map((t) => [
    String(t.id),
    shortDate(t.date),
    t.merchant ?? "—",
    t.description ?? "—",
    t.category ?? "Unknown",
    money(t.amount),
  ]);
  return (
    <Card title="Rule Test — Matches">
      <T header={["ID", "Date", "Merchant", "Description", "Category", "Amount"]} rows={rows} />
    </Card>
  );
}

export function RulesApplyCard({ data }: { data: RulesApplyResult }) {
  return (
    <Card title="Rule Apply">
      <div className="text-sm">
        Applied to <b>{data.applied}</b> transactions
        {typeof data.preview === "number" ? ` (preview: ${data.preview})` : ""}.
      </div>
    </Card>
  );
}

/** ---------- Insights Expanded ---------- */

const pctFmt = (p: number | null) => (p == null ? "—" : `${Math.round(p * 100)}%`);
const deltaBadge = (v: number) => (
  <span
    className={`px-2 py-0.5 rounded-full text-xs ${
      v > 0
        ? "bg-[rgba(251,113,133,0.15)] text-[var(--accent-bad)] border border-[rgba(251,113,133,0.35)]"
        : v < 0
        ? "bg-[rgba(52,211,153,0.15)] text-[var(--accent-good)] border border-[rgba(52,211,153,0.35)]"
        : "bg-[color:var(--bg-card-alt)] text-[color:var(--text-muted)] border border-[color:var(--border-subtle)]"
    }`}
  >
    {v > 0 ? "▲" : v < 0 ? "▼" : "•"} {Math.abs(v).toFixed(2)}
  </span>
);

function MoMRow({ label, stat }: { label: string; stat: MoMStat }) {
  return (
    <tr className="border-b last:border-b-0" style={{ borderColor: "var(--border-subtle)" }}>
      <td className="py-2 pr-4 text-[color:var(--text-muted)]">{label}</td>
      <td className="py-2 pr-4">{stat.prev.toFixed(2)}</td>
      <td className="py-2 pr-4">{stat.curr.toFixed(2)}</td>
      <td className="py-2 pr-4">{deltaBadge(stat.delta)}</td>
      <td className="py-2 pr-4">{pctFmt(stat.pct)}</td>
    </tr>
  );
}

export function InsightsExpandedCard({ data }: { data: InsightsExpandedResult }) {
  const sum = data.summary;
  const mom = data.mom;
  const cats = data.anomalies?.categories ?? [];
  const merch = data.anomalies?.merchants ?? [];

  return (
  <section className="panel p-4 space-y-3">
      <div className="rounded-2xl border border-[color:var(--border-subtle)] bg-[var(--bg-card)] p-4 shadow-lg text-[var(--text)]">
        <div className="flex items-baseline justify-between mb-2">
          <h3 className="text-sm font-semibold text-[var(--text)]">
            Expanded Insights — {data.month || "(latest)"}
          </h3>
          {data.prev_month ? (
            <span className="text-xs text-[color:var(--text-muted)]">vs {data.prev_month}</span>
          ) : (
            <span className="text-xs text-[color:var(--text-muted)]">no prior month</span>
          )}
        </div>

        {sum ? (
          <div className="grid grid-cols-3 gap-4 mb-3">
            <div>
              <div className="text-xs text-[color:var(--text-muted)]">Income</div>
              <div className="text-2xl font-semibold text-[var(--text-strong)]">{money(sum.income)}</div>
            </div>
            <div>
              <div className="text-xs text-[color:var(--text-muted)]">Spend</div>
              <div className="text-2xl font-semibold text-[var(--text-strong)]">{money(Math.abs(sum.spend))}</div>
            </div>
            <div>
              <div className="text-xs text-[color:var(--text-muted)]">Net</div>
              <div
                className={`text-2xl font-semibold ${
                  sum.net > 0
                    ? "text-[var(--accent-good)]"
                    : sum.net < 0
                    ? "text-[var(--accent-bad)]"
                    : "text-[var(--text-strong)]"
                }`}
              >
                {money(sum.net)}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-sm text-[color:var(--text-muted)]">No data for this month.</div>
        )}

        {data.unknown_spend && (
          <span className="inline-flex items-center gap-1 badge-warn">
            Unknown spend: {money(Math.abs(data.unknown_spend.amount))} ({data.unknown_spend.count} txns)
          </span>
        )}
      </div>

      {mom ? (
        <Card title="Month-over-Month">
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[color:var(--text-muted)] border-b" style={{ borderColor: "var(--border-subtle)" }}>
                  <th className="py-2 pr-4">Metric</th>
                  <th className="py-2 pr-4">Prev</th>
                  <th className="py-2 pr-4">Curr</th>
                  <th className="py-2 pr-4">Δ</th>
                  <th className="py-2 pr-4">% Δ</th>
                </tr>
              </thead>
              <tbody>
                <MoMRow label="Income" stat={mom.income} />
                <MoMRow label="Spend" stat={mom.spend} />
                <MoMRow label="Net" stat={mom.net} />
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      <div className="grid md:grid-cols-2 gap-3">
        <div className="rounded-2xl border border-[color:var(--border-subtle)] bg-[var(--bg-card)] p-4 shadow-lg text-[var(--text)]">
          <h3 className="text-sm font-semibold mb-2 text-[var(--text)]">Top Categories</h3>
          <table className="w-full text-sm">
            <thead className="border-b" style={{ borderColor: "var(--border-subtle)" }}>
              <tr className="text-left text-[color:var(--text-muted)]">
                <th className="py-2 font-medium">Category</th>
                <th className="py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {(data.top_categories ?? []).map((c, i) => (
                <tr key={i} className="hover:bg-[color:var(--bg-card-alt)]">
                  <td className="py-2">{c.category}</td>
                  <td className="py-2 text-right text-[var(--text-strong)]">{money(c.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-2xl border border-[color:var(--border-subtle)] bg-[var(--bg-card)] p-4 shadow-lg text-[var(--text)]">
          <h3 className="text-sm font-semibold mb-2 text-[var(--text)]">Top Merchants</h3>
          <table className="w-full text-sm">
            <thead className="border-b" style={{ borderColor: "var(--border-subtle)" }}>
              <tr className="text-left text-[color:var(--text-muted)]">
                <th className="py-2 font-medium">Merchant</th>
                <th className="py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {(data.top_merchants ?? []).map((m, i) => (
                <tr key={i} className="hover:bg-[color:var(--bg-card-alt)]">
                  <td className="py-2">{m.merchant}</td>
                  <td className="py-2 text-right text-[var(--text-strong)]">{money(m.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl border border-[color:var(--border-subtle)] bg-[var(--bg-card)] p-4 shadow-lg text-[var(--text)]">
        <h3 className="text-sm font-semibold mb-2 text-[var(--text)]">Large Transactions</h3>
        <table className="w-full text-sm">
          <thead className="border-b" style={{ borderColor: "var(--border-subtle)" }}>
            <tr className="text-left text-[color:var(--text-muted)]">
              <th className="py-2 font-medium">Date</th>
              <th className="py-2 font-medium">Merchant</th>
              <th className="py-2 font-medium">Category</th>
              <th className="py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {(data.large_transactions ?? []).map((t, i) => (
              <tr key={i} className="hover:bg-[color:var(--bg-card-alt)]">
                <td className="py-2">{shortDate(t.date ?? undefined)}</td>
                <td className="py-2">{t.merchant || "—"}</td>
                <td className="py-2">{t.category || "Unknown"}</td>
                <td className="py-2 text-right text-[var(--text-strong)]">{money(t.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <Card title="Anomalies — Categories">
          {(data.anomalies?.categories ?? []).length ? (
            <T
              header={["Category", "Prev", "Curr", "Δ", "% Δ"]}
              rows={(data.anomalies?.categories ?? []).map((a) => [
                a.key,
                a.prev.toFixed(2),
                a.curr.toFixed(2),
                a.delta.toFixed(2),
                pctFmt(a.pct),
              ])}
            />
          ) : (
            <div className="text-sm text-[color:var(--text-muted)]">No category spikes detected.</div>
          )}
        </Card>
        <Card title="Anomalies — Merchants">
          {(data.anomalies?.merchants ?? []).length ? (
            <T
              header={["Merchant", "Prev", "Curr", "Δ", "% Δ"]}
              rows={(data.anomalies?.merchants ?? []).map((a) => [
                a.key,
                a.prev.toFixed(2),
                a.curr.toFixed(2),
                a.delta.toFixed(2),
                pctFmt(a.pct),
              ])}
            />
          ) : (
            <div className="text-sm text-[color:var(--text-muted)]">No merchant spikes detected.</div>
          )}
        </Card>
      </div>
  </section>
  );
}

/** ---------- Dispatcher ---------- */

export function AgentResultRenderer({ tool, data }: { tool: ToolKey; data: any }) {
  switch (tool) {
    case "transactions.search":
      return <TransactionsSearchCard data={data as TransactionsSearchResult} />;
    case "transactions.categorize":
      return <CategorizeResultCard data={data as CategorizeResult} />;
    case "transactions.get_by_ids":
      return <TransactionsSearchCard data={{ items: data as any[] } as TransactionsSearchResult} />;
    case "budget.summary":
      return <BudgetSummaryCard data={data as BudgetSummaryResult} />;
    case "budget.check":
      return <BudgetCheckCard data={data as BudgetCheckResult} />;
    case "insights.expanded":
      return <InsightsExpandedCard data={data as InsightsExpandedResult} />;
    case "charts.summary":
      return <ChartsSummaryCard data={data as ChartsSummaryResult} />;
    case "charts.merchants":
      return <ChartsMerchantsCard data={data as ChartsMerchantsResult} />;
    case "charts.flows":
      return <ChartsFlowsCard data={data as ChartsFlowsResult} />;
    case "charts.trends":
      return <ChartsTrendsCard data={data as ChartsTrendsResult} />;
    case "rules.test":
      return <RulesTestCard data={data as RulesTestResult} />;
    case "rules.apply":
      return <RulesApplyCard data={data as RulesApplyResult} />;
    default:
      return <pre className="text-xs whitespace-pre-wrap break-all">{JSON.stringify(data, null, 2)}</pre>;
  }
}
