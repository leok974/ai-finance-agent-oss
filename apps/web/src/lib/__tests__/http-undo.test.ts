/**
 * Tests for manual categorization undo API
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  manualCategorizeUndo,
  type ManualCategorizeAffectedTxn,
  type ManualCategorizeUndoResponse,
} from '../http';

describe('manualCategorizeUndo', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('should call the correct endpoint with affected transactions', async () => {
    const affected: ManualCategorizeAffectedTxn[] = [
      {
        id: 1,
        date: '2025-01-15',
        amount: '50.00',
        merchant: 'Test Merchant',
        previous_category_slug: 'unknown',
        new_category_slug: 'groceries',
      },
    ];

    const mockResponse: ManualCategorizeUndoResponse = {
      reverted_count: 1,
    };

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    } as Response);

    const result = await manualCategorizeUndo(affected);

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('transactions/categorize/manual/undo'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ affected }),
      })
    );

    expect(result).toEqual(mockResponse);
    expect(result.reverted_count).toBe(1);
  });

  it('should handle empty affected array', async () => {
    const mockResponse: ManualCategorizeUndoResponse = {
      reverted_count: 0,
    };

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    } as Response);

    const result = await manualCategorizeUndo([]);

    expect(result.reverted_count).toBe(0);
  });

  it('should handle network errors', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('Network error'));

    await expect(manualCategorizeUndo([])).rejects.toThrow();
  });
});
