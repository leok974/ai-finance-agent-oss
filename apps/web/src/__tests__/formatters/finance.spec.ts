/**
 * Unit tests for finance formatters
 */

import { describe, it, expect } from 'vitest';
import { renderQuick, renderDeep, type MonthSummary } from '@/lib/formatters/finance';

describe('Finance Formatters', () => {
  const mockSummary: MonthSummary = {
    month: '2025-01',
    income: 5000,
    spend: 3500,
    net: 1500,
    topMerchant: { name: 'Amazon', amount: 450 },
    unknown: { amount: 200, count: 15, top: ['Venmo', 'PayPal', 'Cash App'] },
    categories: [
      { name: 'Groceries', amount: 800 },
      { name: 'Dining out', amount: 350, note: '↑ vs last month' },
      { name: 'Transportation', amount: 250 },
      { name: 'Entertainment', amount: 200 },
      { name: 'Utilities', amount: 150 },
      { name: 'Shopping', amount: 100 },
    ],
    spikes: [
      { date: '2025-01-15', merchant: 'Best Buy', amount: 1200, note: 'New laptop' },
      { date: '2025-01-22', merchant: 'Delta Airlines', amount: 550 },
    ],
  };

  describe('renderQuick', () => {
    it('renders month name', () => {
      const result = renderQuick(mockSummary);
      expect(result).toContain('2025-01');
      expect(result).toContain('Quick recap');
    });

    it('formats income as USD currency', () => {
      const result = renderQuick(mockSummary);
      expect(result).toContain('$5,000.00');
    });

    it('formats spend as USD currency', () => {
      const result = renderQuick(mockSummary);
      expect(result).toContain('$3,500.00');
    });

    it('renders positive net with + sign', () => {
      const result = renderQuick(mockSummary);
      expect(result).toContain('+$1,500.00');
    });

    it('renders negative net without + sign', () => {
      const negativeSummary = { ...mockSummary, net: -500 };
      const result = renderQuick(negativeSummary);
      expect(result).toContain('-$500.00'); // Currency formatter puts minus before $
      expect(result).not.toMatch(/\+\$-500/);
    });

    it('includes top merchant', () => {
      const result = renderQuick(mockSummary);
      expect(result).toContain('Amazon');
      expect(result).toContain('$450.00');
    });

    it('includes unknown transactions count', () => {
      const result = renderQuick(mockSummary);
      expect(result).toContain('$200.00');
      expect(result).toContain('15'); // Shows "15 txns" not "15 transactions"
      expect(result).toContain('txns');
    });

    it('prompts for deeper explanation', () => {
      const result = renderQuick(mockSummary);
      expect(result).toContain('Want a deeper breakdown'); // Actual text
    });
  });

  describe('renderDeep', () => {
    it('renders month name', () => {
      const result = renderDeep(mockSummary);
      expect(result).toContain('2025-01');
      expect(result).toContain('Deep dive');
    });

    it('clamps categories to top 5', () => {
      const result = renderDeep(mockSummary);
      expect(result).toContain('Groceries');
      expect(result).toContain('Dining out');
      expect(result).toContain('Transportation');
      expect(result).toContain('Entertainment');
      expect(result).toContain('Utilities');
      expect(result).not.toContain('Shopping'); // 6th item should be excluded
    });

    it('formats category amounts as USD', () => {
      const result = renderDeep(mockSummary);
      expect(result).toContain('$800.00');
      expect(result).toContain('$350.00');
    });

    it('includes category notes when present', () => {
      const result = renderDeep(mockSummary);
      expect(result).toContain('↑ vs last month');
    });

    it('includes unknown transactions section', () => {
      const result = renderDeep(mockSummary);
      expect(result).toContain('Unknown'); // Section header is just "Unknown"
      expect(result).toContain('$200.00');
      expect(result).toContain('15'); // Shows "15 txns"
      expect(result).toContain('txns');
    });

    it('lists top unknown contributors', () => {
      const result = renderDeep(mockSummary);
      expect(result).toContain('Venmo');
      expect(result).toContain('PayPal');
      expect(result).toContain('Cash App');
    });

    it('includes spikes section when present', () => {
      const result = renderDeep(mockSummary);
      expect(result).toContain('Spikes & notes');
      expect(result).toContain('2025-01-15');
      expect(result).toContain('Best Buy');
      expect(result).toContain('$1,200.00');
      expect(result).toContain('New laptop');
    });

    it('omits spikes section when not present', () => {
      const noSpikes = { ...mockSummary, spikes: undefined };
      const result = renderDeep(noSpikes);
      expect(result).not.toContain('Spikes & notes');
    });

    it('includes follow-up prompt', () => {
      const result = renderDeep(mockSummary);
      expect(result).toContain('Next actions'); // Section heading, no question
    });

    it('renders as valid markdown', () => {
      const result = renderDeep(mockSummary);
      // Check for markdown bold (used for headings and emphasis)
      expect(result).toMatch(/\*\*.+\*\*/);
      // Check for markdown lists
      expect(result).toMatch(/^\d+\.\s/m);
      // Check for bold formatting
      expect(result).toContain('**');
    });
  });

  describe('Currency formatting', () => {
    it('formats whole dollars correctly', () => {
      const wholeDollarSummary = { ...mockSummary, income: 1000 };
      const result = renderQuick(wholeDollarSummary);
      expect(result).toContain('$1,000.00');
    });

    it('formats cents correctly', () => {
      const centsSummary = { ...mockSummary, income: 1234.56 };
      const result = renderQuick(centsSummary);
      expect(result).toContain('$1,234.56');
    });

    it('formats large numbers with commas', () => {
      const largeSummary = { ...mockSummary, income: 50000 };
      const result = renderQuick(largeSummary);
      expect(result).toContain('$50,000.00');
    });
  });
});
