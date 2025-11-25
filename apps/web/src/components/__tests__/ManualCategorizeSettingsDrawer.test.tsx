import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ManualCategorizeSettingsDrawer } from '../ManualCategorizeSettingsDrawer';
import type { ManualCategorizeResponse } from '@/lib/http';

// Mock the http module
vi.mock('@/lib/http', () => ({
  manualCategorizeUndo: vi.fn(),
}));

// Mock toast helpers
vi.mock('@/lib/toast-helpers', () => ({
  emitToastSuccess: vi.fn(),
  emitToastError: vi.fn(),
}));

// Mock sonner
vi.mock('sonner', () => ({
  toast: {
    info: vi.fn(),
  },
}));

describe('ManualCategorizeSettingsDrawer', () => {
  let localStorageMock: Record<string, string>;

  beforeEach(() => {
    // Mock localStorage
    localStorageMock = {};
    global.Storage.prototype.getItem = vi.fn((key: string) => localStorageMock[key] || null);
    global.Storage.prototype.setItem = vi.fn((key: string, value: string) => {
      localStorageMock[key] = value;
    });
    global.Storage.prototype.removeItem = vi.fn((key: string) => {
      delete localStorageMock[key];
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows "no categorization found" when localStorage is empty', async () => {
    render(<ManualCategorizeSettingsDrawer open={true} onOpenChange={() => {}} />);

    await waitFor(() => {
      expect(
        screen.getByText(/No manual bulk categorization found/i)
      ).toBeInTheDocument();
    });
  });

  it('displays updated_count correctly from localStorage snapshot', async () => {
    const mockSnapshot: ManualCategorizeResponse = {
      txn_id: 123,
      category_slug: 'groceries',
      scope: 'same_merchant' as any,
      updated_count: 5,
      similar_updated: 4,
      hint_applied: true,
      affected: [
        {
          id: 1,
          date: '2025-11-01',
          amount: -25.5,
          merchant: 'Whole Foods',
          previous_category_slug: 'unknown',
          new_category_slug: 'groceries',
        },
        {
          id: 2,
          date: '2025-11-05',
          amount: -40.0,
          merchant: 'Whole Foods',
          previous_category_slug: 'unknown',
          new_category_slug: 'groceries',
        },
        {
          id: 3,
          date: '2025-11-10',
          amount: -15.75,
          merchant: 'Whole Foods',
          previous_category_slug: 'unknown',
          new_category_slug: 'groceries',
        },
        {
          id: 4,
          date: '2025-11-15',
          amount: -32.25,
          merchant: 'Whole Foods',
          previous_category_slug: 'unknown',
          new_category_slug: 'groceries',
        },
        {
          id: 5,
          date: '2025-11-20',
          amount: -28.0,
          merchant: 'Whole Foods',
          previous_category_slug: 'unknown',
          new_category_slug: 'groceries',
        },
      ],
    };

    localStorageMock['lm:lastManualCategorize'] = JSON.stringify(mockSnapshot);

    render(<ManualCategorizeSettingsDrawer open={true} onOpenChange={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText(/Last bulk change/i)).toBeInTheDocument();
    });

    // Check that it shows the correct count (5 transactions, NOT 0)
    expect(screen.getByText(/Updated 5 transactions/i)).toBeInTheDocument();

    // Check scope and category
    expect(screen.getByText(/Scope:/)).toBeInTheDocument();
    expect(screen.getByText(/same_merchant/)).toBeInTheDocument();
    expect(screen.getByText(/Groceries/i)).toBeInTheDocument();

    // Check that affected transactions are displayed (use getAllByText since there are multiple)
    const wholeFoodsElements = screen.getAllByText(/Whole Foods/i);
    expect(wholeFoodsElements.length).toBeGreaterThan(0);
  });

  it('displays singular "transaction" when updated_count is 1', async () => {
    const mockSnapshot: ManualCategorizeResponse = {
      txn_id: 456,
      category_slug: 'dining',
      scope: 'just_this' as any,
      updated_count: 1,
      similar_updated: 0,
      hint_applied: false,
      affected: [
        {
          id: 10,
          date: '2025-11-24',
          amount: -45.0,
          merchant: 'Restaurant',
          previous_category_slug: 'unknown',
          new_category_slug: 'dining',
        },
      ],
    };

    localStorageMock['lm:lastManualCategorize'] = JSON.stringify(mockSnapshot);

    render(<ManualCategorizeSettingsDrawer open={true} onOpenChange={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText(/Last bulk change/i)).toBeInTheDocument();
    });

    // Should say "1 transaction" not "1 transactions"
    expect(screen.getByText(/Updated 1 transaction$/i)).toBeInTheDocument();
  });

  // Skip this test due to vaul drawer pointer events limitation in happy-dom
  it.skip('clears localStorage after successful undo', async () => {
    const { manualCategorizeUndo } = await import('@/lib/http');
    const { emitToastSuccess } = await import('@/lib/toast-helpers');

    const mockSnapshot: ManualCategorizeResponse = {
      txn_id: 789,
      category_slug: 'groceries',
      scope: 'same_merchant' as any,
      updated_count: 3,
      similar_updated: 2,
      hint_applied: true,
      affected: [
        {
          id: 20,
          date: '2025-11-01',
          amount: -25.5,
          merchant: 'Store',
          previous_category_slug: 'unknown',
          new_category_slug: 'groceries',
        },
        {
          id: 21,
          date: '2025-11-05',
          amount: -30.0,
          merchant: 'Store',
          previous_category_slug: 'unknown',
          new_category_slug: 'groceries',
        },
        {
          id: 22,
          date: '2025-11-10',
          amount: -20.0,
          merchant: 'Store',
          previous_category_slug: 'unknown',
          new_category_slug: 'groceries',
        },
      ],
    };

    localStorageMock['lm:lastManualCategorize'] = JSON.stringify(mockSnapshot);

    vi.mocked(manualCategorizeUndo).mockResolvedValue({ reverted_count: 3 });

    render(<ManualCategorizeSettingsDrawer open={true} onOpenChange={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText(/Updated 3 transactions/i)).toBeInTheDocument();
    });

    const undoButton = screen.getByRole('button', { name: /Undo this change/i });
    await userEvent.click(undoButton);

    await waitFor(() => {
      expect(manualCategorizeUndo).toHaveBeenCalledWith(mockSnapshot.affected);
      expect(emitToastSuccess).toHaveBeenCalledWith('Reverted 3 transactions.');
    });

    // Verify localStorage was cleared
    expect(global.Storage.prototype.removeItem).toHaveBeenCalledWith(
      'lm:lastManualCategorize'
    );
  });

  it('shows affected transaction IDs and amounts', async () => {
    const mockSnapshot: ManualCategorizeResponse = {
      txn_id: 100,
      category_slug: 'groceries',
      scope: 'same_merchant' as any,
      updated_count: 2,
      similar_updated: 1,
      hint_applied: true,
      affected: [
        {
          id: 101,
          date: '2025-11-15',
          amount: -50.25,
          merchant: 'Market',
          previous_category_slug: 'unknown',
          new_category_slug: 'groceries',
        },
        {
          id: 102,
          date: '2025-11-16',
          amount: -75.5,
          merchant: 'Market',
          previous_category_slug: 'unknown',
          new_category_slug: 'groceries',
        },
      ],
    };

    localStorageMock['lm:lastManualCategorize'] = JSON.stringify(mockSnapshot);

    render(<ManualCategorizeSettingsDrawer open={true} onOpenChange={() => {}} />);

    await waitFor(() => {
      const marketElements = screen.getAllByText(/Market/i);
      expect(marketElements.length).toBeGreaterThan(0);
    });

    // Check that amounts are displayed correctly (absolute values)
    expect(screen.getByText(/\$50\.25/)).toBeInTheDocument();
    expect(screen.getByText(/\$75\.50/)).toBeInTheDocument();
  });
});
