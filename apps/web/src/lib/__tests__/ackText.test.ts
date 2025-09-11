import { describe, it, expect } from 'vitest';
import { getAckText, type LearningAck } from '@/lib/api';

describe('getAckText', () => {
  it('prefers llm over deterministic', () => {
    const ack: LearningAck = { deterministic: 'Saved.', llm: 'All set! Future similar items will be categorized.', mode: 'llm' };
    expect(getAckText(ack)).toContain('All set!');
  });
  it('falls back to deterministic', () => {
    const ack: LearningAck = { deterministic: 'Saved.', mode: 'deterministic' };
    expect(getAckText(ack)).toBe('Saved.');
  });
  it('returns empty string when missing', () => {
    expect(getAckText(undefined)).toBe('');
    expect(getAckText(null as any)).toBe('');
  });
});
