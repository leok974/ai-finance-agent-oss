// Central feature flags (tree-shakeable when statically referenced)
// eslint-disable-next-line no-restricted-globals
const envEnabled = typeof import.meta !== 'undefined' && !!import.meta.env?.VITE_SUGGESTIONS_ENABLED;
export const FEATURES = {
  suggestions: envEnabled, // controlled via VITE_SUGGESTIONS_ENABLED env at build time
};
export type FeatureFlagName = keyof typeof FEATURES;
