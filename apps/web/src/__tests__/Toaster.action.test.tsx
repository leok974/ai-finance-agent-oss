import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { Toaster } from '@/components/ui/toaster';

// This test ensures that an action object { label, onClick } dispatched via the
// app:toast event is converted into a rendered ToastAction button and invokes
// the provided handler when clicked.

describe('Toaster action object bridge', () => {
  it('renders action object as ToastAction and invokes handler', async () => {
    const onClick = vi.fn();
    render(<Toaster />);

    const detail = {
      title: 'With Action',
      description: 'Click the action',
      variant: 'default',
      action: { label: 'Do it', onClick },
    };
    window.dispatchEvent(new CustomEvent('app:toast', { detail }));

    // Title & description should appear
    await screen.findByText('With Action');
    await screen.findByText('Click the action');

    // The action button should render with the label
    const btn = await screen.findByRole('button', { name: /Do it/i });
    fireEvent.click(btn);

    await waitFor(() => expect(onClick).toHaveBeenCalledTimes(1));
  });
});
