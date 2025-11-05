import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthContext, type User } from '@/state/auth';
import DevMenu from '@/components/dev/DevMenu';

// Mock context provider
const MockAuthProvider = ({ user, children }: { user: User; children: React.ReactNode }) => {
  const mockValue = {
    user,
    authReady: true,
    login: async () => {},
    register: async () => {},
    logout: () => {},
    refresh: async () => true,
  };
  return <AuthContext.Provider value={mockValue}>{children}</AuthContext.Provider>;
};

describe('Admin Guard for Category Rules', () => {
  const mockOnToggle = () => {};

  beforeEach(() => {
    // Set dev mode
    import.meta.env.MODE = 'development';
  });

  it('shows Admin Rules menu item for admin users', async () => {
    const adminUser: User = {
      email: 'admin@example.com',
      roles: ['admin', 'user'],
      is_active: true,
    };

    render(
      <MockAuthProvider user={adminUser}>
        <DevMenu adminRulesOpen={false} onToggleAdminRules={mockOnToggle} />
      </MockAuthProvider>
    );
    // Open the menu to render items (Radix needs pointer events)
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /dev/i }));
  // Wait for portal content to mount
  const adminItem = await screen.findByTestId('nav-admin-rules');
  expect(adminItem).toBeInTheDocument();
  expect(await screen.findByText('Admin: Category Rules')).toBeInTheDocument();
  });

  it('hides Admin Rules menu item for non-admin users', async () => {
    const regularUser: User = {
      email: 'user@example.com',
      roles: ['user'],
      is_active: true,
    };

    render(
      <MockAuthProvider user={regularUser}>
        <DevMenu adminRulesOpen={false} onToggleAdminRules={mockOnToggle} />
      </MockAuthProvider>
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /dev/i }));
    // Admin menu item should NOT be visible
    expect(screen.queryByTestId('nav-admin-rules')).not.toBeInTheDocument();
    expect(screen.queryByText('Admin: Category Rules')).not.toBeInTheDocument();
  });

  it('hides Admin Rules menu item for unauthenticated users', async () => {
    render(
      <MockAuthProvider user={null}>
        <DevMenu adminRulesOpen={false} onToggleAdminRules={mockOnToggle} />
      </MockAuthProvider>
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /dev/i }));
    // Admin menu item should NOT be visible
    expect(screen.queryByTestId('nav-admin-rules')).not.toBeInTheDocument();
  });

  it('shows other dev menu items regardless of admin status', async () => {
    const regularUser: User = {
      email: 'user@example.com',
      roles: ['user'],
      is_active: true,
    };

    render(
      <MockAuthProvider user={regularUser}>
        <DevMenu adminRulesOpen={false} onToggleAdminRules={mockOnToggle} />
      </MockAuthProvider>
    );
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /dev/i }));
  // Other dev tools should still be visible
  expect(await screen.findByText('Planner DevTool')).toBeInTheDocument();
  expect(await screen.findByText('Planner Apply Panel')).toBeInTheDocument();
  });
});
