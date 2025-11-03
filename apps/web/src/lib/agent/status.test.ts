import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchAgentStatus } from './status';
import * as http from '@/lib/http';

// Mock the fetchJSON function
vi.mock('@/lib/http', () => ({
  fetchJSON: vi.fn(),
}));

describe('fetchAgentStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns status when API responds successfully', async () => {
    vi.mocked(http.fetchJSON).mockResolvedValueOnce({
      ok: true,
      llm_ok: true,
      provider: 'openai',
      model: 'gpt-4',
    });

    const result = await fetchAgentStatus();

    expect(result).toEqual({
      ok: true,
      llm_ok: true,
      provider: 'openai',
      model: 'gpt-4',
    });
    expect(http.fetchJSON).toHaveBeenCalledWith('agent/status', { signal: undefined });
  });

  it('returns default status when API fails', async () => {
    vi.mocked(http.fetchJSON).mockRejectedValueOnce(new Error('Network error'));

    const result = await fetchAgentStatus();

    expect(result).toEqual({
      ok: false,
      llm_ok: false,
    });
  });

  it('handles partial response data', async () => {
    vi.mocked(http.fetchJSON).mockResolvedValueOnce({
      ok: true,
      // llm_ok missing
    });

    const result = await fetchAgentStatus();

    expect(result.ok).toBe(true);
    expect(result.llm_ok).toBe(false); // defaults to false
  });
});
