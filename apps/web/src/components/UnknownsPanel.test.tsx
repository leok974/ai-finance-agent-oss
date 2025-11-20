import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Import the component
import UnknownsPanel from './UnknownsPanel';

// Mock the useUnknowns hook
vi.mock('@/hooks/useUnknowns', () => {
  return {
    useUnknowns: () => ({
      items: [
        {
          id: 123,
          merchant: 'Test Merchant',
          merchant_canonical: 'test_merchant',
          description: 'Test Transaction',
          amount: -42.0,
          date: '2025-11-19',
          category: null,
        },
      ],
      loading: false,
      error: null,
      currentMonth: '2025-11',
      refresh: vi.fn(),
    }),
  };
});

// Mock the ML feedback API
vi.mock('@/lib/api', () => ({
  mlFeedback: vi.fn().mockResolvedValue(undefined),
  applyCategory: vi.fn().mockResolvedValue({ updated: 1, category: 'groceries', txn_ids: [123] }),
}));

// Mock the suggestForTxnBatch API
vi.mock('@/api', () => ({
  mlFeedback: vi.fn().mockResolvedValue(undefined),
  suggestForTxnBatch: vi.fn().mockResolvedValue({
    items: [
      {
        txn: 123,
        suggestions: [
          {
            category_slug: 'groceries',
            label: 'Groceries',
            score: 0.9,
            why: ['Merchant name matches grocery pattern'],
          },
        ],
      },
    ],
  }),
}));

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: any) => {
      if (opts) {
        return `${key}:${JSON.stringify(opts)}`;
      }
      return key;
    },
  }),
}));

// Mock the toast notifications
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

// Mock Tooltip components
vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: any) => children,
  TooltipTrigger: ({ children }: any) => children,
  TooltipContent: () => null,
  TooltipProvider: ({ children }: any) => children,
}));

// Mock Card components
vi.mock('@/components/ui/card', () => ({
  Card: ({ children, className }: any) => <div className={className}>{children}</div>,
  CardContent: ({ children, className }: any) => <div className={className}>{children}</div>,
  CardHeader: ({ children, className }: any) => <div className={className}>{children}</div>,
  CardTitle: ({ children, className }: any) => <h3 className={className}>{children}</h3>,
}));

// Mock Button component
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, ...props }: any) => (
    <button onClick={onClick} {...props}>
      {children}
    </button>
  ),
}));

// Mock Skeleton component
vi.mock('@/components/ui/skeleton', () => ({
  Skeleton: ({ className }: any) => <div className={className} />,
}));

// Mock other components
vi.mock('@/components/InfoDot', () => ({
  InfoDot: () => <span>ⓘ</span>,
}));

vi.mock('@/components/LearnedBadge', () => ({
  default: () => <span>Learned!</span>,
}));

vi.mock('@/components/EmptyState', () => ({
  default: () => <div>No transactions</div>,
}));

vi.mock('@/components/CardHelpTooltip', () => ({
  default: () => null,
}));

// Mock ExplainSignalDrawer
vi.mock('@/components/ExplainSignalDrawer', () => ({
  default: () => null,
}));

// Mock useAuth hook
vi.mock('@/state/auth', () => ({
  useAuth: () => ({
    user: { id: 1, email: 'test@example.com' },
    loading: false,
  }),
  useIsAdmin: () => false,
}));

// Mock toast helpers
vi.mock('@/lib/toast-helpers', () => ({
  emitToastSuccess: vi.fn(),
  emitToastError: vi.fn(),
}));

// Mock the refresh bus utility
vi.mock('@/utils/refreshBus', () => ({
  useCoalescedRefresh: () => vi.fn(),
}));

// Mock seedRuleFromTxn
vi.mock('@/lib/rulesSeed', () => ({
  seedRuleFromTxn: vi.fn().mockReturnValue({}),
}));

// Mock help text
vi.mock('@/lib/helpBaseText', () => ({
  getHelpBaseText: vi.fn().mockReturnValue('Help text'),
}));

// Mock i18n
vi.mock('@/lib/i18n', () => ({
  t: (key: string) => key,
}));

describe('UnknownsPanel – suggestion chips', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('hides the row after clicking a suggestion chip', async () => {
    const user = userEvent.setup();

    render(<UnknownsPanel />);

    // Initially: one row visible
    const rows = screen.getAllByTestId('uncat-transaction-row');
    expect(rows.length).toBe(1);

    // Wait for suggestions to load
    const chip = await screen.findByTestId('uncat-suggestion-chip', {}, { timeout: 3000 });
    
    // Click the chip
    await user.click(chip);

    // After click: row should disappear (Set + filter should win)
    await waitFor(
      () => {
        const remaining = screen.queryAllByTestId('uncat-transaction-row');
        expect(remaining.length).toBe(0);
      },
      { timeout: 5000 }
    );
  });

  it('renders transaction details correctly', () => {
    render(<UnknownsPanel />);

    // Check that transaction data is displayed
    expect(screen.getByText('Test Merchant')).toBeInTheDocument();
    expect(screen.getByText('$42.00')).toBeInTheDocument();
  });

  it('renders suggestion chip with correct label and score', () => {
    render(<UnknownsPanel />);

    const chip = screen.getByTestId('uncat-suggestion-chip');
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveTextContent('Groceries');
    expect(chip).toHaveTextContent('90%');
  });
});
