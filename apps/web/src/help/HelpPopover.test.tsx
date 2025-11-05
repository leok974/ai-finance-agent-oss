import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import HelpPopover from './HelpPopover';
import { describe as describeFn } from '@/lib/api';
import { vi, test, expect, beforeEach, afterEach, describe } from 'vitest';

vi.mock('@/lib/api', async (orig) => {
  const actual: any = await (orig as any)();
  return {
    ...actual,
    describe: vi.fn(),
    telemetry: { helpOpen: vi.fn().mockResolvedValue(undefined) }
  };
});

const baseEntry: any = { title: 'Top Merchants', body: 'Original deterministic text.' };
const rect: DOMRect = { x:0,y:0,top:120,left:40,bottom:0,right:0,height:0,width:0,toJSON(){return{};} } as any;

const mockedDescribe = describeFn as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  sessionStorage.clear();
  mockedDescribe.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

function mount() {
  render(<HelpPopover rect={rect} entry={baseEntry} onClose={()=>{}} />);
}

test('shows loading then deterministic fallback on error', async () => {
  mockedDescribe.mockRejectedValueOnce(new Error('boom'));
  mount();
  expect(screen.getByText(/Loading/i)).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument());
  expect(screen.getByText('Original deterministic text.')).toBeInTheDocument();
});

test('renders AI‑polished badge when rephrased true', async () => {
  mockedDescribe.mockResolvedValueOnce({ text: 'Polished text', grounded: true, rephrased: true, llm_called: true, provider: 'primary', panel_id: 'top_merchants', mode: 'explain', reasons: [] });
  mount();
  await screen.findByText('Polished text');
  expect(screen.getByText('AI‑polished')).toBeInTheDocument();
});

test('renders AI checked badge when identical_output reason present (baseline)', async () => {
  mockedDescribe.mockResolvedValueOnce({ text: 'Original deterministic text.', grounded: true, rephrased: false, llm_called: true, provider: 'primary', panel_id: 'top_merchants', mode: 'explain', reasons: ['identical_output'], fallback_reason: 'identical_output', effective_unavailable: false });
  mount();
  await screen.findByText('Original deterministic text.');
  expect(screen.getByText('AI checked')).toBeInTheDocument();
});

test('renders AI checked note when identical_output reason present', async () => {
  mockedDescribe.mockResolvedValueOnce({ text: 'Original deterministic text.', grounded: true, rephrased: false, llm_called: true, provider: 'primary', panel_id: 'top_merchants', mode: 'explain', reasons: ['identical_output'], fallback_reason: 'identical_output', effective_unavailable: false });
  mount();
  await screen.findByText('Original deterministic text.');
  expect(screen.getByText('AI checked')).toBeInTheDocument();
  expect(screen.getByText(/original wording was already clear/i)).toBeInTheDocument();
});

test('shows unavailability message only when effective_unavailable', async () => {
  mockedDescribe.mockResolvedValueOnce({ text: 'The language model is temporarily unavailable.', grounded: true, rephrased: false, llm_called: true, provider: 'primary', panel_id: 'top_merchants', mode: 'explain', reasons: [], fallback_reason: 'model_unavailable', effective_unavailable: true });
  mount();
  await screen.findByText(/temporarily unavailable/i);
  expect(screen.getByText(/deterministic description/i)).toBeInTheDocument();
});

test('renders Policy blocked badge when reason present', async () => {
  mockedDescribe.mockResolvedValueOnce({ text: 'Filtered text', grounded: true, rephrased: false, llm_called: true, provider: 'primary', panel_id: 'top_merchants', mode: 'explain', reasons: ['policy_blocked'] });
  mount();
  await screen.findByText('Filtered text');
  expect(screen.getByText('Policy blocked')).toBeInTheDocument();
});

test('renders No data badge when reason present', async () => {
  mockedDescribe.mockResolvedValueOnce({ text: 'No data for selection', grounded: true, rephrased: false, llm_called: false, provider: 'primary', panel_id: 'top_merchants', mode: 'learn', reasons: ['no_data'] });
  mount();
  await screen.findByText('No data for selection');
  expect(screen.getByText('No data')).toBeInTheDocument();
});
