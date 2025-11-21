import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RulesPanel from '../RulesPanel';
import * as api from '@/lib/api';
import * as toastHelpers from '@/lib/toast-helpers';
import { RuleSeedProvider } from '@/hooks/useRuleSeed';

// Mock API calls
vi.mock('@/lib/api', () => ({
  getRules: vi.fn(),
  deleteRule: vi.fn(),
}));

// Mock state/rules
vi.mock('@/state/rules', () => ({
  addRule: vi.fn(),
}));

// Mock toast helpers
vi.mock('@/lib/toast-helpers', () => ({
  emitToastSuccess: vi.fn(),
  emitToastError: vi.fn(),
}));

// Mock i18n
vi.mock('@/lib/i18n', () => ({
  t: (key: string, opts?: any) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
}));

// Mock scroll utility
vi.mock('@/lib/scroll', () => ({
  scrollToId: vi.fn(),
}));

// Mock rules draft state
vi.mock('@/state/rulesDraft', () => ({
  setRuleDraft: vi.fn(),
}));

// Mock Card component
vi.mock('../Card', () => ({
  default: ({ children }: any) => <div>{children}</div>,
}));

// Mock UI components
vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: any) => children,
  TooltipTrigger: ({ children }: any) => children,
  TooltipContent: () => null,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, ...props }: any) => (
    <button onClick={onClick} {...props}>
      {children}
    </button>
  ),
}));

vi.mock('@/components/ui/toast', () => ({
  ToastAction: ({ children }: any) => <span>{children}</span>,
}));

vi.mock('../InfoDot', () => ({
  InfoDot: () => <span>ⓘ</span>,
}));

describe('RulesPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.getRules as any).mockResolvedValue({ items: [], total: 0 });
  });

  it('shows success toast after creating a rule', async () => {
    const user = userEvent.setup();
    const addRule = await import('@/state/rules').then((m) => m.addRule);

    // Mock successful rule creation
    (addRule as any).mockResolvedValue({
      id: 1,
      name: 'Test Rule',
      display_name: 'Test Rule',
      category_label: 'Groceries',
      then: { category: 'groceries' },
    });

    render(
      <RuleSeedProvider>
        <RulesPanel />
      </RuleSeedProvider>
    );

    // Wait for component to load
    await waitFor(() => {
      expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
    });

    // Fill in the form (find inputs by role/label)
    const descriptionInput = screen.getByPlaceholderText(/pattern/i);
    const categoryInput = screen.getByPlaceholderText(/category/i);

    await user.type(descriptionInput, 'whole foods');
    await user.type(categoryInput, 'groceries');

    // Submit the form
    const createButton = screen.getByRole('button', { name: /create/i });
    await user.click(createButton);

    // Verify toast was called with success message
    await waitFor(() => {
      expect(toastHelpers.emitToastSuccess).toHaveBeenCalledWith(
        'Rule created',
        expect.objectContaining({
          description: expect.stringContaining('Groceries'),
        })
      );
    });
  });

  it('shows error toast when rule creation fails', async () => {
    const user = userEvent.setup();
    const addRule = await import('@/state/rules').then((m) => m.addRule);

    // Mock failed rule creation
    (addRule as any).mockRejectedValue(new Error('Validation failed'));

    render(
      <RuleSeedProvider>
        <RulesPanel />
      </RuleSeedProvider>
    );

    // Wait for component to load
    await waitFor(() => {
      expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
    });

    // Fill in the form
    const descriptionInput = screen.getByPlaceholderText(/pattern/i);
    const categoryInput = screen.getByPlaceholderText(/category/i);

    await user.type(descriptionInput, 'test');
    await user.type(categoryInput, 'invalid');

    // Submit the form
    const createButton = screen.getByRole('button', { name: /create/i });
    await user.click(createButton);

    // Verify error toast was called
    await waitFor(() => {
      expect(toastHelpers.emitToastError).toHaveBeenCalled();
    });
  });
});
