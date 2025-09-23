import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { Toaster } from '@/components/ui/toast';

// Mock toast helpers so we can intercept success() arguments after bridge conversion
vi.mock('@/lib/toast-helpers', () => {
  (globalThis as any).__t_success = [];
  return {
    toast: {
      success: (msg: string, opts?: any) => { (globalThis as any).__t_success.push([msg, opts]); },
      error: vi.fn(),
    },
  } as any;
});

describe('Toaster action object bridge', () => {
  it('converts action object into React element & preserves handler', async () => {
    const handler = vi.fn();
    render(<Toaster />);
    await Promise.resolve(); // ensure listener registered

    const detail = {
      type: 'success',
      message: 'With Action',
      options: { description: 'Click the action', action: { label: 'Do it', onClick: handler } },
    };
    window.dispatchEvent(new CustomEvent('app:toast', { detail }));

    const calls = (globalThis as any).__t_success;
    expect(calls.length).toBe(1);
    const [msg, opts] = calls[0];
    expect(msg).toBe('With Action');
    expect(opts.description).toBe('Click the action');
  expect(opts.action).toBeTruthy();
  // Should be a valid React element produced from the action object
  expect(React.isValidElement(opts.action)).toBe(true);
  expect(opts.action.props.children).toBe('Do it');
  // Invoke onClick prop manually (simulate click)
  opts.action.props.onClick({ preventDefault(){} });
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
