export function prettyToolName(key: string): string {
  if (!key) return '';
  const map: Record<string, string> = {
    kpis: 'KPIs',
    'what-if': 'What-if',
    forecast: 'Forecast',
    merchants: 'Merchants',
    overview: 'Overview',
    cashflow: 'Cashflow',
    budget: 'Budget',
    subscriptions: 'Subscriptions',
    anomalies: 'Anomalies',
    alerts: 'Alerts',
  };
  if (map[key]) return map[key];
  const parts = key.split(/[-_.]/g).filter(Boolean);
  return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

// Legacy ChatDock formatting: strip known namespaces and keep lowercase segments / dots intact.
// This preserves existing snapshot & text assertions expecting forms like "alerts" or "forecast.cashflow".
export function stripToolNamespaces(name: string): string {
  if (!name) return '';
  return name
    .replace('analytics.', '')
    .replace('charts.', '')
    .replace('agent.', '')
    .replace(/_/g, ' ');
}
