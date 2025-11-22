import { describe, it, expect } from 'vitest';
import {
  formatCategorizeUnknowns,
  formatShowSpikes,
  formatTopMerchantsDetail,
  formatBudgetCheck,
} from '../financeActions';
import type { MonthSummary } from '../finance';

describe('financeActions formatters', () => {
  describe('formatTopMerchantsDetail', () => {
    it('should display real merchant names with amounts and categories', () => {
      const summary: MonthSummary = {
        month: 'November 2025',
        month_id: '2025-11',
        income: 5000,
        spend: 3200,
        net: 1800,
        merchants: [
          { name: 'CVS Pharmacy', amount: 420.15, category: 'groceries' },
          { name: 'Harris Teeter', amount: 350.20, category: 'groceries' },
          { name: 'PlayStation', amount: 199.99, category: 'games' },
        ],
      };

      const result = formatTopMerchantsDetail(summary);

      expect(result).toContain('CVS Pharmacy');
      expect(result).toContain('$420.15');
      expect(result).toContain('groceries');
      expect(result).toContain('Harris Teeter');
      expect(result).toContain('$350.20');
      expect(result).toContain('PlayStation');
      expect(result).toContain('$199.99');
      expect(result).toContain('games');
      expect(result).toContain('Combined');
      expect(result).not.toMatch(/Unknown.*Unknown/); // Should not show "Unknown" multiple times
    });

    it('should fall back to categories if merchants not available', () => {
      const summary: MonthSummary = {
        month: 'November 2025',
        month_id: '2025-11',
        income: 5000,
        spend: 3200,
        net: 1800,
        categories: [
          { name: 'Groceries', amount: 800 },
          { name: 'Restaurants', amount: 400 },
        ],
      };

      const result = formatTopMerchantsDetail(summary);

      expect(result).toContain('Groceries');
      expect(result).toContain('$800.00');
      expect(result).toContain('Restaurants');
      expect(result).toContain('$400.00');
    });

    it('should show message when no data available', () => {
      const summary: MonthSummary = {
        month: 'November 2025',
        month_id: '2025-11',
        income: 0,
        spend: 0,
        net: 0,
      };

      const result = formatTopMerchantsDetail(summary);

      expect(result).toContain('No merchant data available');
    });
  });

  describe('formatShowSpikes', () => {
    it('should display valid spikes with amounts and percentages', () => {
      const summary: MonthSummary = {
        month: 'November 2025',
        month_id: '2025-11',
        income: 5000,
        spend: 3200,
        net: 1800,
        spikes: [
          { date: '2025-11', merchant: 'Groceries', amount: 450, note: '+200% vs prev' },
          { date: '2025-11', merchant: 'Restaurants', amount: 320, note: '+167% vs prev' },
        ],
      };

      const result = formatShowSpikes(summary);

      expect(result).toContain('Groceries');
      expect(result).toContain('$450.00');
      expect(result).toContain('+200% vs prev');
      expect(result).toContain('Restaurants');
      expect(result).toContain('$320.00');
      expect(result).toContain('+167% vs prev');
      expect(result).toContain('2 notable anomal');
    });

    it('should filter out zero-amount spikes', () => {
      const summary: MonthSummary = {
        month: 'November 2025',
        month_id: '2025-11',
        income: 5000,
        spend: 3200,
        net: 1800,
        spikes: [
          { date: '2025-11', merchant: 'Unknown', amount: 0 },
          { date: '2025-11', merchant: 'Unknown', amount: 0 },
        ],
      };

      const result = formatShowSpikes(summary);

      expect(result).toContain('No notable spikes');
      expect(result).not.toContain('$0.00');
    });

    it('should show "no spikes" message when list is empty', () => {
      const summary: MonthSummary = {
        month: 'November 2025',
        month_id: '2025-11',
        income: 5000,
        spend: 3200,
        net: 1800,
        spikes: [],
      };

      const result = formatShowSpikes(summary);

      expect(result).toContain('No notable spikes');
      expect(result).toContain('baseline');
    });
  });

  describe('formatCategorizeUnknowns', () => {
    it('should show unknown count and amount with top contributors', () => {
      const summary: MonthSummary = {
        month: 'November 2025',
        month_id: '2025-11',
        income: 5000,
        spend: 3200,
        net: 1800,
        unknown: {
          amount: 1234.56,
          count: 15,
          top: ['Mystery Merchant', 'Cash Withdrawal', 'ATM Fee'],
        },
      };

      const result = formatCategorizeUnknowns(summary);

      expect(result).toContain('15 transactions');
      expect(result).toContain('$1,234.56');
      expect(result).toContain('Mystery Merchant');
      expect(result).toContain('Cash Withdrawal');
      expect(result).toContain('ATM Fee');
    });

    it('should show success message when no unknowns', () => {
      const summary: MonthSummary = {
        month: 'November 2025',
        month_id: '2025-11',
        income: 5000,
        spend: 3200,
        net: 1800,
        unknown: { amount: 0, count: 0 },
      };

      const result = formatCategorizeUnknowns(summary);

      expect(result).toContain('No uncategorized');
      expect(result).toContain('Great job');
    });
  });

  describe('formatBudgetCheck', () => {
    it('should calculate savings rate and provide appropriate feedback', () => {
      const summary: MonthSummary = {
        month: 'November 2025',
        month_id: '2025-11',
        income: 5000,
        spend: 3000,
        net: 2000,
      };

      const result = formatBudgetCheck(summary);

      expect(result).toContain('$5,000.00'); // income
      expect(result).toContain('$3,000.00'); // spend
      expect(result).toContain('+$2,000.00'); // net
      expect(result).toContain('40%'); // savings rate
      expect(result).toContain('Great'); // positive feedback
    });

    it('should warn when spending exceeds income', () => {
      const summary: MonthSummary = {
        month: 'November 2025',
        month_id: '2025-11',
        income: 3000,
        spend: 4000,
        net: -1000,
      };

      const result = formatBudgetCheck(summary);

      expect(result).toContain('Spending exceeds income');
      expect(result).toContain('$1,000.00');
    });
  });
});
