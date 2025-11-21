import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsDrawer } from '../SettingsDrawer';
import * as api from '@/lib/api';
import * as toastHelpers from '@/lib/toast-helpers';

// Mock API calls
vi.mock('@/lib/api', () => ({
  listRules: vi.fn(),
  updateRule: vi.fn(),
  deleteRule: vi.fn(),
}));

// Mock toast helpers
vi.mock('@/lib/toast-helpers', () => ({
  emitToastSuccess: vi.fn(),
  emitToastError: vi.fn(),
}));

// Mock UI drawer components
vi.mock('@/components/ui/drawer', () => ({
  Drawer: ({ children, open }: any) => (open ? <div data-testid="drawer-root">{children}</div> : null),
  DrawerContent: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  DrawerHeader: ({ children }: any) => <div>{children}</div>,
  DrawerTitle: ({ children }: any) => <h2>{children}</h2>,
  DrawerDescription: ({ children }: any) => <p>{children}</p>,
  DrawerClose: ({ children }: any) => children,
}));

// Mock Button component
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, ...props }: any) => (
    <button onClick={onClick} {...props}>
      {children}</button>
  ),
}));

// Mock Lucide icons
vi.mock('lucide-react', () => ({
  X: () => <span>×</span>,
}));

describe('SettingsDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads rules on open and displays them', async () => {
    (api.listRules as any).mockResolvedValue({
      items: [
        {
          id: 1,
          name: 'Netflix Rule',
          enabled: true,
          when: { description_like: 'netflix' },
          then: { category: 'subscriptions' },
          category_label: 'Subscriptions',
        },
        {
          id: 2,
          name: 'Grocery Rule',
          enabled: false,
          when: { description_like: 'whole foods' },
          then: { category: 'groceries' },
          category_label: 'Groceries',
        },
      ],
    });

    render(<SettingsDrawer open={true} onClose={() => {}} />);

    // Wait for rules to load
    await waitFor(() => {
      expect(api.listRules).toHaveBeenCalled();
    });

    // Verify rules are displayed
    await waitFor(() => {
      expect(screen.getByText('Subscriptions')).toBeInTheDocument();
      expect(screen.getByText('Groceries')).toBeInTheDocument();
    });

    // Verify toggle buttons show correct state
    const toggleButtons = screen.getAllByTestId('settings-rule-toggle');
    expect(toggleButtons[0]).toHaveTextContent('Enabled');
    expect(toggleButtons[1]).toHaveTextContent('Disabled');
  });

  it('shows empty state when no rules exist', async () => {
    (api.listRules as any).mockResolvedValue({ items: [] });

    render(<SettingsDrawer open={true} onClose={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText(/No rules yet/i)).toBeInTheDocument();
    });
  });

  it('toggles rule active state and shows toast', async () => {
    const user = userEvent.setup();

    (api.listRules as any).mockResolvedValue({
      items: [
        {
          id: 1,
          name: 'Netflix Rule',
          enabled: true,
          when: { description_like: 'netflix' },
          then: { category: 'subscriptions' },
          category_label: 'Subscriptions',
        },
      ],
    });

    (api.updateRule as any).mockResolvedValue({
      id: 1,
      name: 'Netflix Rule',
      enabled: false,
      when: { description_like: 'netflix' },
      then: { category: 'subscriptions' },
      category_label: 'Subscriptions',
    });

    render(<SettingsDrawer open={true} onClose={() => {}} />);

    // Wait for rule to load
    await waitFor(() => {
      expect(screen.getByText('Subscriptions')).toBeInTheDocument();
    });

    // Find and click toggle button
    const toggleButton = screen.getByTestId('settings-rule-toggle');
    await user.click(toggleButton);

    // Verify API was called with correct parameters
    await waitFor(() => {
      expect(api.updateRule).toHaveBeenCalledWith(1, { enabled: false });
    });

    // Verify toast was shown
    expect(toastHelpers.emitToastSuccess).toHaveBeenCalledWith(
      'Rule disabled',
      expect.objectContaining({
        description: expect.stringContaining('Subscriptions'),
      })
    );
  });

  it('deletes rule after confirmation and shows toast', async () => {
    const user = userEvent.setup();

    // Mock window.confirm - must define it globally first
    global.confirm = vi.fn().mockReturnValue(true);

    (api.listRules as any).mockResolvedValue({
      items: [
        {
          id: 1,
          name: 'Netflix Rule',
          enabled: true,
          when: { description_like: 'netflix' },
          then: { category: 'subscriptions' },
          category_label: 'Subscriptions',
        },
      ],
    });

    (api.deleteRule as any).mockResolvedValue(undefined);

    render(<SettingsDrawer open={true} onClose={() => {}} />);

    // Wait for rule to load
    await waitFor(() => {
      expect(screen.getByText('Subscriptions')).toBeInTheDocument();
    });

    // Find and click delete button
    const deleteButton = screen.getByTestId('settings-rule-delete');
    await user.click(deleteButton);

    // Verify confirmation was shown
    expect(global.confirm).toHaveBeenCalled();

    // Verify API was called
    await waitFor(() => {
      expect(api.deleteRule).toHaveBeenCalledWith(1);
    });

    // Verify success toast was shown
    expect(toastHelpers.emitToastSuccess).toHaveBeenCalledWith(
      'Rule deleted',
      expect.objectContaining({
        description: expect.stringContaining('Subscriptions'),
      })
    );

    // Verify rule is removed from UI
    await waitFor(() => {
      expect(screen.queryByText('Subscriptions')).not.toBeInTheDocument();
    });
  });

  it('does not delete rule if confirmation is cancelled', async () => {
    const user = userEvent.setup();

    // Mock window.confirm to return false (cancel)
    global.confirm = vi.fn().mockReturnValue(false);

    (api.listRules as any).mockResolvedValue({
      items: [
        {
          id: 1,
          name: 'Netflix Rule',
          enabled: true,
          when: { description_like: 'netflix' },
          then: { category: 'subscriptions' },
          category_label: 'Subscriptions',
        },
      ],
    });

    render(<SettingsDrawer open={true} onClose={() => {}} />);

    // Wait for rule to load
    await waitFor(() => {
      expect(screen.getByText('Subscriptions')).toBeInTheDocument();
    });

    // Find and click delete button
    const deleteButton = screen.getByTestId('settings-rule-delete');
    await user.click(deleteButton);

    // Verify confirmation was shown
    expect(global.confirm).toHaveBeenCalled();

    // Verify API was NOT called
    expect(api.deleteRule).not.toHaveBeenCalled();

    // Verify rule is still in UI
    expect(screen.getByText('Subscriptions')).toBeInTheDocument();
  });

  it('shows error toast when rule update fails', async () => {
    const user = userEvent.setup();

    (api.listRules as any).mockResolvedValue({
      items: [
        {
          id: 1,
          name: 'Netflix Rule',
          enabled: true,
          when: { description_like: 'netflix' },
          then: { category: 'subscriptions' },
          category_label: 'Subscriptions',
        },
      ],
    });

    (api.updateRule as any).mockRejectedValue(new Error('Network error'));

    render(<SettingsDrawer open={true} onClose={() => {}} />);

    // Wait for rule to load
    await waitFor(() => {
      expect(screen.getByText('Subscriptions')).toBeInTheDocument();
    });

    // Find and click toggle button
    const toggleButton = screen.getByTestId('settings-rule-toggle');
    await user.click(toggleButton);

    // Verify error toast was shown
    await waitFor(() => {
      expect(toastHelpers.emitToastError).toHaveBeenCalledWith(
        'Failed to update rule',
        expect.objectContaining({
          description: 'Please try again.',
        })
      );
    });
  });

  it('shows error toast when delete fails', async () => {
    const user = userEvent.setup();

    global.confirm = vi.fn().mockReturnValue(true);

    (api.listRules as any).mockResolvedValue({
      items: [
        {
          id: 1,
          name: 'Netflix Rule',
          enabled: true,
          when: { description_like: 'netflix' },
          then: { category: 'subscriptions' },
          category_label: 'Subscriptions',
        },
      ],
    });

    (api.deleteRule as any).mockRejectedValue(new Error('Network error'));

    render(<SettingsDrawer open={true} onClose={() => {}} />);

    // Wait for rule to load
    await waitFor(() => {
      expect(screen.getByText('Subscriptions')).toBeInTheDocument();
    });

    // Find and click delete button
    const deleteButton = screen.getByTestId('settings-rule-delete');
    await user.click(deleteButton);

    // Verify error toast was shown
    await waitFor(() => {
      expect(toastHelpers.emitToastError).toHaveBeenCalledWith(
        'Failed to delete rule',
        expect.objectContaining({
          description: 'Please try again.',
        })
      );
    });
  });

  it('does not load rules when drawer is closed', () => {
    render(<SettingsDrawer open={false} onClose={() => {}} />);

    expect(api.listRules).not.toHaveBeenCalled();
  });
});
