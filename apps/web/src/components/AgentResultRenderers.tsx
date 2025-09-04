// src/components/AgentResultRenderers.tsx
import React from "react";
import { money, shortDate } from "../utils/format";
import type {
  TransactionsSearchResult,
  CategorizeResult,
  BudgetSummaryResult,
  BudgetCheckResult,
  InsightSummaryResult,
  // We'll accept unknown shape for expanded; optional future type
  ChartsSummaryResult,
  ChartsMerchantsResult,
  ChartsFlowsResult,
  ChartsTrendsResult,
  RulesTestResult,
  RulesApplyResult,
  Txn,
} from "../types/agentToolsResults";

// Shared card
function Card({ title, children, right }: React.PropsWithChildren<{ title: string; right?: React.ReactNode }>) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-gray-900">{title}</h3>
        {right}
      </div>
      {children}
    </div>
  );
}

// Tiny table
function T({ header, rows }: { header: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-gray-500">
            {header.map((h) => (
              <th key={h} className="py-1 pr-4">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t">
              {r.map((c, j) => (
                <td key={j} className="py-1 pr-4 align-top">{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ----- Transactions
export function TransactionsSearchCard({ data }: { data: TransactionsSearchResult }) {
  const rows = (data.items ?? []).slice(0, 50).map((t: Txn) => [
    shortDate(t.date),
    t.merchant || "—",
    t.description || "—",
    t.category || "Unknown",
    <span className={Number(t.amount) < 0 ? "text-red-600" : "text-emerald-700"}>{money(t.amount)}</span>,
  ]);
  return (
    <Card title={`Transactions (${data.total ?? rows.length})`}>
      <T header={["Date", "Merchant", "Description", "Category", "Amount"]} rows={rows} />
    </Card>
  );
}

export function CategorizeResultCard({ data }: { data: CategorizeResult }) {
  const rows = (data.updated ?? []).map((u) => [String(u.id), u.category]);
  return (
    <Card title="Categorize Result" right={<span className="text-xs text-gray-500">{rows.length} updated</span>}>
      <T header={["Txn ID", "New Category"]} rows={rows} />
      {data.skipped ? <p className="mt-2 text-xs text-gray-500">{data.skipped} skipped (already labeled)</p> : null}
    </Card>
  );
}

// ----- Budget
export function BudgetSummaryCard({ data }: { data: BudgetSummaryResult }) {
  const rows = (data.totals ?? []).map((x) => [x.category, money(x.budget ?? null), money(x.actual)]);
  return (
    <Card title={`Budget Summary ${data.month ? `— ${data.month}` : ""}`}>
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

// ----- Insights
export function InsightSummaryCard({ data }: { data: InsightSummaryResult }) {
  const topCats = (data.topCategories ?? []).slice(0, 5).map((c) => [c.category, money(c.amount)]);
  const topMerch = (data.topMerchants ?? []).slice(0, 5).map((m) => [m.merchant, money(m.amount)]);
  const large = (data.largeTransactions ?? []).slice(0, 5).map((t) => [
    shortDate(t.date),
    t.merchant || "—",
    t.category || "Unknown",
    money(t.amount),
  ]);
  return (
    <div className="grid md:grid-cols-2 gap-3">
      <Card title={`Summary ${data.month ? `— ${data.month}` : ""}`}>
        <div className="text-sm text-gray-800 space-y-1">
          <div>Income: <b>{money(data.summary?.income ?? 0)}</b></div>
          <div>Spend: <b>{money(data.summary?.spend ?? 0)}</b></div>
          <div>Net: <b>{money(data.summary?.net ?? 0)}</b></div>
          {data.unknownSpend ? (
            <div className="text-amber-700">
              Unknown spend: <b>{money(data.unknownSpend.amount)}</b> ({data.unknownSpend.count} txns)
            </div>
          ) : null}
        </div>
      </Card>
      <Card title="Top Categories"><T header={["Category", "Amount"]} rows={topCats} /></Card>
      <Card title="Top Merchants"><T header={["Merchant", "Amount"]} rows={topMerch} /></Card>
      <Card title="Large Transactions"><T header={["Date", "Merchant", "Category", "Amount"]} rows={large} /></Card>
    </div>
  );
}

// ----- Charts
export function ChartsSummaryCard({ data }: { data: ChartsSummaryResult }) {
  return (
    <Card title={`Chart Summary ${data.month ? `— ${data.month}` : ""}`}>
      <div className="grid grid-cols-3 gap-3 text-sm">
        <div><div className="text-gray-500">Income</div><div className="font-semibold">{money(data.income)}</div></div>
        <div><div className="text-gray-500">Spend</div><div className="font-semibold">{money(data.spend)}</div></div>
        <div><div className="text-gray-500">Net</div><div className="font-semibold">{money(data.net)}</div></div>
      </div>
    </Card>
  );
}

export function ChartsMerchantsCard({ data }: { data: ChartsMerchantsResult }) {
  const rows = (data.merchants ?? []).map(m => [m.merchant, money(m.amount)]);
  return <Card title={`Top Merchants ${data.month ? `— ${data.month}` : ""}`}><T header={["Merchant","Amount"]} rows={rows} /></Card>;
}

export function ChartsFlowsCard({ data }: { data: ChartsFlowsResult }) {
  const inflow = (data.inflow ?? []).map(x => [x.name, money(x.amount)]);
  const outflow = (data.outflow ?? []).map(x => [x.name, money(x.amount)]);
  return (
    <div className="grid md:grid-cols-2 gap-3">
      <Card title="Inflow"><T header={["Source","Amount"]} rows={inflow} /></Card>
      <Card title="Outflow"><T header={["Sink","Amount"]} rows={outflow} /></Card>
    </div>
  );
}

export function ChartsTrendsCard({ data }: { data: ChartsTrendsResult }) {
  const rows = (data.series ?? []).map(s => [s.month, money(s.income), money(s.spend), money(s.net)]);
  return <Card title="Spending Trends"><T header={["Month","Income","Spend","Net"]} rows={rows} /></Card>;
}

// ----- Rules
export function RulesTestCard({ data }: { data: RulesTestResult }) {
  const rows = (data.matched ?? []).slice(0, 50).map(t => [
    String(t.id),
    shortDate(t.date),
    t.merchant ?? "—",
    t.description ?? "—",
    t.category ?? "Unknown",
    money(t.amount),
  ]);
  return (
    <Card title="Rule Test — Matches">
      <T header={["ID","Date","Merchant","Description","Category","Amount"]} rows={rows} />
    </Card>
  );
}

export function RulesApplyCard({ data }: { data: RulesApplyResult }) {
  return (
    <Card title="Rule Apply">
      <div className="text-sm">
        Applied to <b>{data.applied}</b> transactions{typeof data.preview === "number" ? ` (preview: ${data.preview})` : ""}.
      </div>
    </Card>
  );
}

// ----- Dispatcher
export function AgentResultRenderer({ tool, data }: { tool: string; data: unknown }) {
  switch (tool) {
    case "transactions.search":       return <TransactionsSearchCard data={data as TransactionsSearchResult} />;
    case "transactions.categorize":   return <CategorizeResultCard data={data as CategorizeResult} />;
    case "transactions.get_by_ids":   return <TransactionsSearchCard data={{ items: data as any[] }} />;
    case "budget.summary":            return <BudgetSummaryCard data={data as BudgetSummaryResult} />;
    case "budget.check":              return <BudgetCheckCard data={data as BudgetCheckResult} />;
    case "insights.summary":          return <InsightSummaryCard data={data as InsightSummaryResult} />;
    case "insights.expanded":         return (
      <Card title="Insights — Expanded">
        <pre className="text-xs whitespace-pre-wrap break-words">{JSON.stringify(data, null, 2)}</pre>
      </Card>
    );
    case "charts.summary":            return <ChartsSummaryCard data={data as ChartsSummaryResult} />;
    case "charts.merchants":          return <ChartsMerchantsCard data={data as ChartsMerchantsResult} />;
    case "charts.flows":              return <ChartsFlowsCard data={data as ChartsFlowsResult} />;
    case "charts.trends":             return <ChartsTrendsCard data={data as ChartsTrendsResult} />;
    case "rules.test":                return <RulesTestCard data={data as RulesTestResult} />;
    case "rules.apply":               return <RulesApplyCard data={data as RulesApplyResult} />;
    default:
      return (
        <Card title="Result">
          <pre className="text-xs whitespace-pre-wrap break-words">{JSON.stringify(data, null, 2)}</pre>
        </Card>
      );
  }
}
