/**
 * Finance deep-dive action handlers
 * These provide rich fallback responses using dashboard data
 * when the agent is unavailable or in fallback mode
 */

import type { MonthSummary } from './finance';

const fmt = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

/**
 * Generate a reply for categorize_unknowns action
 */
export function formatCategorizeUnknowns(summary: MonthSummary): string {
  const { unknown, month } = summary;

  if (!unknown || unknown.count === 0) {
    return `**No uncategorized transactions found for ${month}**\n\nAll transactions have been categorized. Great job!`;
  }

  const lines = [
    `**Uncategorized Transactions — ${month}**`,
    '',
    `Found **${unknown.count} transaction${unknown.count === 1 ? '' : 's'}** totaling **${fmt(unknown.amount)}**`,
    ''
  ];

  if (unknown.top && unknown.top.length > 0) {
    lines.push('**Top contributors:**');
    unknown.top.slice(0, 3).forEach((merchant, i) => {
      lines.push(`${i + 1}. ${merchant}`);
    });
    lines.push('');
  }

  lines.push('💡 **Next step:** Open the Unknowns panel to bulk-categorize these transactions.');

  return lines.join('\n');
}

/**
 * Generate a reply for show_spikes action
 */
export function formatShowSpikes(summary: MonthSummary): string {
  const { spikes, month } = summary;

  if (!spikes || spikes.length === 0) {
    return `**No unusual spikes detected for ${month}**\n\nSpending patterns look normal across categories and merchants.`;
  }

  const lines = [
    `**Spending Spikes — ${month}**`,
    '',
    `Found **${spikes.length} notable anomal${spikes.length === 1 ? 'y' : 'ies'}:**`,
    ''
  ];

  spikes.slice(0, 5).forEach((spike, i) => {
    const note = spike.note ? ` (${spike.note})` : '';
    lines.push(`${i + 1}. **${spike.merchant}** — ${fmt(spike.amount)}${note}`);
  });

  return lines.join('\n');
}

/**
 * Generate a reply for top_merchants action
 */
export function formatTopMerchantsDetail(summary: MonthSummary): string {
  const { month } = summary;

  // Use categories as a proxy for merchants if not available separately
  const merchants = summary.categories || [];

  if (merchants.length === 0) {
    return `**No merchant data available for ${month}**\n\nTry uploading transaction data for this period.`;
  }

  const lines = [
    `**Top Merchants — ${month}**`,
    '',
  ];

  const topFive = merchants.slice(0, 5);
  topFive.forEach((merch, i) => {
    const note = merch.note ? ` — ${merch.note}` : '';
    lines.push(`${i + 1}. **${merch.name}** — ${fmt(merch.amount)}${note}`);
  });

  const total = topFive.reduce((sum, m) => sum + m.amount, 0);
  lines.push('');
  lines.push(`**Combined:** ${fmt(total)}`);

  return lines.join('\n');
}

/**
 * Generate a reply for budget_check action
 */
export function formatBudgetCheck(summary: MonthSummary): string {
  const { month, spend, income, net } = summary;

  const lines = [
    `**Budget Check — ${month}**`,
    '',
    `- **Spent:** ${fmt(spend)}`,
    `- **Income:** ${fmt(income)}`,
    `- **Net:** ${net >= 0 ? '+' : ''}${fmt(net)}`,
    ''
  ];

  // Simple heuristic budget check
  const savingsRate = income > 0 ? (net / income) * 100 : 0;

  if (savingsRate >= 20) {
    lines.push(`✅ **Great!** You're saving ${savingsRate.toFixed(0)}% of your income.`);
  } else if (savingsRate >= 10) {
    lines.push(`⚠️ **Good** but could improve. Saving ${savingsRate.toFixed(0)}% of income.`);
  } else if (savingsRate > 0) {
    lines.push(`⚠️ **Low savings** — only ${savingsRate.toFixed(0)}% of income saved.`);
  } else {
    lines.push(`🚨 **Spending exceeds income** by ${fmt(Math.abs(net))}`);
  }

  return lines.join('\n');
}
