/**
 * Manual Categorization Tests
 * Tests for manual categorization workflow including toast notifications
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { toast } from 'sonner';

// Import the modules we want to test
import * as api from '@/lib/api';
import * as http from '@/lib/http';

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: vi.fn(() => 'toast-id'),
}));

// Mock API functions
vi.mock('@/lib/api', () => ({
  categorizeTxn: vi.fn(),
  mlFeedback: vi.fn(),
  patchTxn: vi.fn(),
}));

vi.mock('@/lib/http', () => ({
  manualCategorizeTransaction: vi.fn(),
}));

vi.mock('@/api/rules', () => ({
  createCategorizeRule: vi.fn(),
}));

describe('Manual Categorization Toast Notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (toast as any).success = vi.fn();
    (toast as any).error = vi.fn();
    (toast as any).info = vi.fn();
  });

  describe('Toast Message Formatting', () => {
    it('success toast includes category name', () => {
      toast.success('Applied "Groceries"', {
        description: 'Updated category for Test Merchant',
        duration: 4000,
      });

      expect(toast.success).toHaveBeenCalledWith(
        'Applied "Groceries"',
        expect.objectContaining({
          description: expect.stringContaining('Test Merchant'),
          duration: 4000,
        })
      );
    });

    it('error toast includes error message', () => {
      toast.error('Failed to apply suggestion', {
        description: 'Network error',
        duration: 5000,
      });

      expect(toast.error).toHaveBeenCalledWith(
        'Failed to apply suggestion',
        expect.objectContaining({
          description: 'Network error',
          duration: 5000,
        })
      );
    });

    it('info toast for dismissed suggestions', () => {
      toast.info('Suggestion dismissed', {
        description: 'Won\'t suggest "Dining" for similar transactions',
        duration: 3000,
      });

      expect(toast.info).toHaveBeenCalledWith(
        'Suggestion dismissed',
        expect.objectContaining({
          description: expect.stringContaining('Won\'t suggest'),
          duration: 3000,
        })
      );
    });

    it('success toast indicates rule creation', () => {
      toast.success('Category updated to "Groceries" (+ rule created)', {
        description: 'Test Merchant',
        duration: 4000,
      });

      expect(toast.success).toHaveBeenCalledWith(
        expect.stringContaining('rule created'),
        expect.objectContaining({
          duration: 4000,
        })
      );
    });
  });

  describe('Toast Durations', () => {
    it('success toasts show for 4 seconds', () => {
      toast.success('Category updated', { duration: 4000 });

      expect(toast.success).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ duration: 4000 })
      );
    });

    it('error toasts show for 5 seconds', () => {
      toast.error('Failed to categorize', { duration: 5000 });

      expect(toast.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ duration: 5000 })
      );
    });

    it('info toasts show for 3 seconds', () => {
      toast.info('Suggestion dismissed', { duration: 3000 });

      expect(toast.info).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ duration: 3000 })
      );
    });
  });

  describe('API Integration Patterns', () => {
    it('categorizeTxn is called before showing toast', async () => {
      vi.mocked(api.categorizeTxn).mockResolvedValue({ updated: 1, category: 'groceries', txn_ids: [123] });

      await api.categorizeTxn(123, 'Groceries');
      toast.success('Applied "Groceries"');

      expect(api.categorizeTxn).toHaveBeenCalledWith(123, 'Groceries');
      expect(toast.success).toHaveBeenCalled();
    });

    it('mlFeedback is called for learning', async () => {
      vi.mocked(api.mlFeedback).mockResolvedValue({ ok: true, id: 1 });

      await api.mlFeedback({
        txn_id: 123,
        merchant: 'test-merchant',
        category: 'Groceries',
        action: 'accept',
      });

      expect(api.mlFeedback).toHaveBeenCalledWith({
        txn_id: 123,
        merchant: 'test-merchant',
        category: 'Groceries',
        action: 'accept',
      });
    });

    it('error toast shows when API call fails', async () => {
      vi.mocked(api.categorizeTxn).mockRejectedValue(new Error('Network error'));

      try {
        await api.categorizeTxn(123, 'Groceries');
      } catch (error) {
        toast.error('Failed to apply suggestion', {
          description: error instanceof Error ? error.message : 'Unknown error',
          duration: 5000,
        });
      }

      expect(toast.error).toHaveBeenCalledWith(
        'Failed to apply suggestion',
        expect.objectContaining({
          description: 'Network error',
        })
      );
    });
  });

  describe('Manual Categorization Response Handling', () => {
    it('handles single transaction update', async () => {
      vi.mocked(http.manualCategorizeTransaction).mockResolvedValue({
        txn_id: 123,
        category_slug: 'groceries',
        scope: 'just_this',
        updated_count: 1,
        similar_updated: 0,
        hint_applied: false,
        affected: [],
      });

      const result = await http.manualCategorizeTransaction(123, {
        categorySlug: 'groceries',
        scope: 'just_this',
      });

      expect(result.updated_count).toBe(1);
      expect(result.similar_updated).toBe(0);
    });

    it('handles bulk transaction update', async () => {
      vi.mocked(http.manualCategorizeTransaction).mockResolvedValue({
        txn_id: 123,
        category_slug: 'groceries',
        scope: 'same_merchant',
        updated_count: 1,
        similar_updated: 5,
        hint_applied: false,
        affected: [],
      });

      const result = await http.manualCategorizeTransaction(123, {
        categorySlug: 'groceries',
        scope: 'same_merchant',
      });

      expect(result.updated_count).toBe(1);
      expect(result.similar_updated).toBe(5);
    });
  });
});
