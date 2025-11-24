/**
 * Format tool names for live status display during streaming
 *
 * Converts internal tool names to friendly versions and formats
 * them into a compact status line like:
 * - "Planning tools: insights.expanded"
 * - "Planning tools: spending.trends + charts.summary"
 * - "Planning tools: search + budget + 2 more"
 */
export function formatToolStatus(tools: string[]): string {
  if (!tools.length) return '';

  // Map internal tool names to friendly versions
  const friendly = tools.map((t) => {
    if (t === 'insights.expanded') return 'insights.expanded';
    if (t === 'analytics.spending.trends') return 'spending.trends';
    if (t === 'charts.summary') return 'charts.summary';
    if (t === 'charts.month_flows') return 'month_flows';
    if (t === 'analytics.top_merchants') return 'top_merchants';
    if (t === 'transactions.search') return 'search';
    if (t === 'analytics.subscriptions') return 'subscriptions';
    if (t === 'analytics.recurring') return 'recurring';
    if (t === 'budget.suggest') return 'budget';
    // Default: strip namespace and use last part
    const parts = t.split('.');
    return parts[parts.length - 1] || t;
  });

  const unique = Array.from(new Set(friendly));

  if (unique.length === 1) {
    return `Planning tools: ${unique[0]}`;
  }
  if (unique.length === 2) {
    return `Planning tools: ${unique[0]} + ${unique[1]}`;
  }
  return `Planning tools: ${unique.slice(0, 2).join(' + ')} + ${unique.length - 2} more`;
}
