import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render } from '@testing-library/react'
import React from 'react'

vi.mock('@/lib/toast-helpers', () => {
  ;(globalThis as any).__t_success = [];
  ;(globalThis as any).__t_error = [];
  return {
    toast: {
      success: (...a: any[]) => { (globalThis as any).__t_success.push(a) },
      error: (...a: any[]) => { (globalThis as any).__t_error.push(a) },
    }
  }
});

import { Toaster } from '@/components/ui/toast'

describe('Toaster — app:toast event bridge', () => {
  beforeEach(() => {
    (globalThis as any).__t_success = [];
    (globalThis as any).__t_error = [];
  })

  it('routes success events to toast.success with options', async () => {
    render(<Toaster />);
    const detail = { type: 'success', message: 'Saved!', options: { duration: 1234 } };
    window.dispatchEvent(new CustomEvent('app:toast', { detail }));
  expect((globalThis as any).__t_success).toEqual([["Saved!", { duration: 1234 }]]);
  expect((globalThis as any).__t_error).toHaveLength(0);
  });

  it('routes error events to toast.error with options', async () => {
    render(<Toaster />);
    const detail = { type: 'error', message: 'Whoops', options: { duration: 2500 } };
    window.dispatchEvent(new CustomEvent('app:toast', { detail }));
  expect((globalThis as any).__t_error).toEqual([["Whoops", { duration: 2500 }]]);
  expect((globalThis as any).__t_success).toHaveLength(0);
  });

  it('defaults to success when type is missing', async () => {
    render(<Toaster />);
    const detail = { message: 'Default path' };
    window.dispatchEvent(new CustomEvent('app:toast', { detail }));
  expect((globalThis as any).__t_success).toEqual([["Default path", {}]]);
  });
});
