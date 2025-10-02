import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { Toaster } from '@/components/ui/toast';
import { emitToastSuccess, emitToastError } from '@/lib/toast-helpers';
import { expectToast, clickToastAction } from './utils/toast';

// Bridge integration: ensures custom event -> Toaster -> DOM works.
describe('Toaster bridge', () => {
  it('renders success toast from emit helper', async () => {
    render(<Toaster />);
    emitToastSuccess('Bridge Success', { description: 'Rendered via event bus' });
    await expectToast(/Bridge Success/);
    await expectToast(/Rendered via event bus/);
  });

  it('renders error toast from emit helper', async () => {
    render(<Toaster />);
    emitToastError('Bridge Error', { description: 'Something failed' });
    await expectToast(/Bridge Error/);
    await expectToast(/Something failed/);
  });

  it('invokes action callback when toast action clicked', async () => {
    render(<Toaster />);
    const spy = vi.fn();
    emitToastSuccess('Action Toast', { action: { label: 'Do it', onClick: spy } });
    await expectToast(/Action Toast/);
    await clickToastAction(/Do it/);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
