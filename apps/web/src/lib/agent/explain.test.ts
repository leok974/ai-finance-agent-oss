import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchCardExplain } from './explain';
import * as http from '@/lib/http';

// Mock the fetchJSON function
vi.mock('@/lib/http', () => ({
  fetchJSON: vi.fn(),
}));

describe('fetchCardExplain', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns explanation when API responds successfully', async () => {
    vi.mocked(http.fetchJSON).mockResolvedValueOnce({
      explain: 'This is a test explanation',
      sources: [{ title: 'Source 1', url: 'https://example.com' }],
    });

    const result = await fetchCardExplain({ cardId: 'cards.overview', month: '2025-08' });

    expect(result.explain).toBe('This is a test explanation');
    expect(result.sources).toHaveLength(1);
    expect(result.sources?.[0]?.title).toBe('Source 1');
  });

  it('returns empty object when API fails', async () => {
    vi.mocked(http.fetchJSON).mockRejectedValueOnce(new Error('Network error'));

    const result = await fetchCardExplain({ cardId: 'cards.overview' });

    expect(result).toEqual({});
  });

  it('extracts explanation from alternative fields', async () => {
    vi.mocked(http.fetchJSON).mockResolvedValueOnce({
      why: 'Alternative explanation field',
    });

    const result = await fetchCardExplain({ cardId: 'cards.overview' });

    expect(result.explain).toBe('Alternative explanation field');
  });

  it('includes month and context in request payload', async () => {
    vi.mocked(http.fetchJSON).mockResolvedValueOnce({});

    await fetchCardExplain({
      cardId: 'cards.overview',
      month: '2025-08',
      ctx: { key: 'value' },
    });

    const callArgs = vi.mocked(http.fetchJSON).mock.calls[0];
    const body = JSON.parse(callArgs[1]?.body as string);

    expect(body).toMatchObject({
      card_id: 'cards.overview',
      month: '2025-08',
      ctx: { key: 'value' },
      rephrase: true,
    });
  });
});
