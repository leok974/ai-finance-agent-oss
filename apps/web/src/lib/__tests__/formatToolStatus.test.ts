import { describe, it, expect } from 'vitest';
import { formatToolStatus } from '../formatToolStatus';

describe('formatToolStatus', () => {
  it('returns empty string for no tools', () => {
    expect(formatToolStatus([])).toBe('');
  });

  it('formats single tool', () => {
    expect(formatToolStatus(['charts.summary'])).toBe(
      'Planning tools: charts.summary',
    );
  });

  it('formats two tools', () => {
    expect(
      formatToolStatus(['insights.expanded', 'analytics.spending.trends']),
    ).toBe('Planning tools: insights.expanded + spending.trends');
  });

  it('handles more than two tools', () => {
    const result = formatToolStatus([
      'charts.summary',
      'insights.expanded',
      'analytics.spending.trends',
    ]);
    expect(result).toMatch(/Planning tools: .* \+ .* \+ 1 more/);
  });

  it('deduplicates tool names', () => {
    const result = formatToolStatus([
      'charts.summary',
      'charts.summary',
      'insights.expanded',
    ]);
    expect(result).toBe('Planning tools: charts.summary + insights.expanded');
  });

  it('strips namespaces from unmapped tools', () => {
    const result = formatToolStatus(['some.nested.tool.name']);
    expect(result).toBe('Planning tools: name');
  });

  it('handles mixed mapped and unmapped tools', () => {
    const result = formatToolStatus([
      'analytics.spending.trends',
      'unknown.tool.xyz',
    ]);
    expect(result).toBe('Planning tools: spending.trends + xyz');
  });

  it('formats "3 more" correctly for 5 tools', () => {
    const result = formatToolStatus([
      'charts.summary',
      'insights.expanded',
      'analytics.spending.trends',
      'budget.suggest',
      'transactions.search',
    ]);
    expect(result).toMatch(/Planning tools: .* \+ .* \+ 3 more/);
  });
});
