import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import DevMenuItem from '@/components/DevMenuItem';
import * as useDev from '@/state/useDevUI';

// Minimal mock for dropdown menu item wrapper expectations
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenuItem: (props: any) => <div role="menuitem" {...props} />
}));

describe('DevMenuItem', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('toggles persistently without alt key', () => {
    const spy = vi.spyOn(useDev, 'setDevUIEnabled');
    const { getByRole } = render(<DevMenuItem />);
    const item = getByRole('menuitem');
    fireEvent.click(item); // persistent toggle
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('performs soft toggle with alt+click (no persistence)', () => {
    const persistentSpy = vi.spyOn(useDev, 'setDevUIEnabled');
    const softSpy = vi.spyOn(useDev, 'setDevUIEnabledSoft');
    const { getByRole } = render(<DevMenuItem />);
    const item = getByRole('menuitem');
    fireEvent.click(item, { altKey: true });
    expect(softSpy).toHaveBeenCalledTimes(1);
    expect(persistentSpy).not.toHaveBeenCalled();
  });
});
