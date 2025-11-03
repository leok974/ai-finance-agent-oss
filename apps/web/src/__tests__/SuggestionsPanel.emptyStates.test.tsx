import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
// Enable feature flag for suggestions in tests before importing component
vi.mock('@/config/featureFlags', () => ({ FEATURES: { suggestions: true } }));
import SuggestionsPanel from '@/components/SuggestionsPanel';

describe('SuggestionsPanel empty states', () => {

  beforeEach(() => {});

  it('shows month_missing hint', async () => {
    render(<SuggestionsPanel month={undefined} items={[]} meta={{ reason: 'month_missing' }} loading={false} />);
    expect(await screen.findByText(/Select a month to see suggestions/i)).toBeInTheDocument();
  });

  it('shows no_data_for_month hint', async () => {
    render(<SuggestionsPanel month={'2025-08'} items={[]} meta={{ reason: 'no_data_for_month' }} loading={false} />);
    expect(await screen.findByText(/No uncategorized transactions/i)).toBeInTheDocument();
  });

  it('shows default empty message', async () => {
    render(<SuggestionsPanel month={'2025-08'} items={[]} meta={undefined} loading={false} />);
    expect(await screen.findByText(/no suggestions right now/i)).toBeInTheDocument();
  });
});
