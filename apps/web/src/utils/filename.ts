/**
 * Filename utilities for exports
 */

export const fileStamp = () =>
  new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

export const financeName = (month: string, kind: "quick" | "deep") =>
  `finance-summary-${month}-${kind}-${fileStamp()}.json`;
