import { describe, it, expect } from 'vitest';
import { prettyToolName, stripToolNamespaces } from '@/utils/prettyToolName';

describe('prettyToolName', () => {
  it('maps known keys', () => {
    expect(prettyToolName('kpis')).toBe('KPIs');
    expect(prettyToolName('what-if')).toBe('What-if');
  });
  it('title-cases unknown keys & separators', () => {
    expect(prettyToolName('top_categories')).toBe('Top Categories');
    expect(prettyToolName('daily.flows')).toBe('Daily Flows');
    expect(prettyToolName('')).toBe('');
  });
  it('strips analytics/charts/agent namespaces and underscores', () => {
    expect(stripToolNamespaces('analytics.alerts')).toBe('alerts');
    expect(stripToolNamespaces('charts.forecast.cashflow')).toBe('forecast.cashflow');
    expect(stripToolNamespaces('agent_top_merchants')).toBe('agent top merchants');
  });
});
