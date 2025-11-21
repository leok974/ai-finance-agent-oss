import { describe, it, expect } from 'vitest';
import { getSuggestionConfidencePercent } from '../suggestions';

describe('getSuggestionConfidencePercent', () => {
  it('should return rounded percentage from score field', () => {
    expect(getSuggestionConfidencePercent({ score: 0.92 })).toBe(92);
    expect(getSuggestionConfidencePercent({ score: 0.35 })).toBe(35);
    expect(getSuggestionConfidencePercent({ score: 0.885 })).toBe(89);
  });

  it('should return rounded percentage from confidence field', () => {
    expect(getSuggestionConfidencePercent({ confidence: 0.70 })).toBe(70);
    expect(getSuggestionConfidencePercent({ confidence: 0.25 })).toBe(25);
    expect(getSuggestionConfidencePercent({ confidence: 0.995 })).toBe(100);
  });

  it('should prefer confidence over score when both present', () => {
    expect(getSuggestionConfidencePercent({ confidence: 0.88, score: 0.35 })).toBe(88);
    expect(getSuggestionConfidencePercent({ confidence: 0.70, score: 0.25 })).toBe(70);
  });

  it('should return 0 for null/undefined input', () => {
    expect(getSuggestionConfidencePercent(null)).toBe(0);
    expect(getSuggestionConfidencePercent(undefined)).toBe(0);
  });

  it('should return 0 when both fields are missing', () => {
    expect(getSuggestionConfidencePercent({})).toBe(0);
  });

  it('should clamp values to 0-100 range', () => {
    expect(getSuggestionConfidencePercent({ score: -0.5 })).toBe(0);
    expect(getSuggestionConfidencePercent({ score: 1.5 })).toBe(100);
    expect(getSuggestionConfidencePercent({ confidence: -0.1 })).toBe(0);
    expect(getSuggestionConfidencePercent({ confidence: 2.0 })).toBe(100);
  });

  it('should handle edge cases: 0 and 1', () => {
    expect(getSuggestionConfidencePercent({ score: 0 })).toBe(0);
    expect(getSuggestionConfidencePercent({ score: 1 })).toBe(100);
    expect(getSuggestionConfidencePercent({ confidence: 0 })).toBe(0);
    expect(getSuggestionConfidencePercent({ confidence: 1 })).toBe(100);
  });

  it('should round correctly at midpoints', () => {
    expect(getSuggestionConfidencePercent({ score: 0.345 })).toBe(35); // rounds up
    expect(getSuggestionConfidencePercent({ score: 0.344 })).toBe(34); // rounds down
    expect(getSuggestionConfidencePercent({ score: 0.875 })).toBe(88); // rounds up
  });

  it('should handle very small positive values', () => {
    expect(getSuggestionConfidencePercent({ score: 0.001 })).toBe(0);
    expect(getSuggestionConfidencePercent({ score: 0.005 })).toBe(1);
  });

  it('should handle values very close to 1', () => {
    expect(getSuggestionConfidencePercent({ score: 0.999 })).toBe(100);
    expect(getSuggestionConfidencePercent({ score: 0.994 })).toBe(99);
  });
});
