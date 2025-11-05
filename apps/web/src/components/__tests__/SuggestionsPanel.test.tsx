import { render, screen } from '@testing-library/react';
import { test, expect } from 'vitest';
import React from 'react';
import { SuggestionsPanel } from '../../components/SuggestionsPanel';
import type { Suggestion } from '@/hooks/useSuggestions';

function renderWith(meta?: Record<string, string> | undefined, items: Suggestion[] = []) {
  return render(<SuggestionsPanel items={items} meta={meta} loading={false} />);
}

test('shows month_missing hint', () => {
  renderWith({ reason: 'month_missing' }, []);
  expect(screen.getByText(/select a month/i)).toBeInTheDocument();
});

test('shows no_data_for_month hint', () => {
  renderWith({ reason: 'no_data_for_month' }, []);
  expect(screen.getByText(/no uncategorized transactions/i)).toBeInTheDocument();
});

test('shows default empty hint', () => {
  renderWith({}, []);
  expect(screen.getByText(/no suggestions/i)).toBeInTheDocument();
});

test('renders items when present', () => {
  const row: Suggestion = { merchant: 'Uber', suggest_category: 'Transport', confidence: 0.9, support: 3 };
  renderWith({}, [row]);
  expect(screen.queryByText(/no suggestions/i)).not.toBeInTheDocument();
});
