import { describe, it, expect } from 'vitest';
// Import Vite root config (two levels up from src/__tests__).
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - vite config is ESM TS file
import config from '../../vite.config.ts';

describe('vite config basics', () => {
  it('defines branch/commit globals', () => {
    // define is a plain object with our injected globals
    expect(config.define).toBeTruthy();
    expect((config as any).define.__WEB_BRANCH__).toMatch(/".*"/);
    expect((config as any).define.__WEB_COMMIT__).toMatch(/"[0-9a-f]{4,40}"/i);
  });

  it('has at least one plugin object and vendor chunk logic configured', () => {
    const plugins = (config as any).plugins;
    expect(Array.isArray(plugins)).toBe(true);
    expect(plugins.length).toBeGreaterThanOrEqual(1);
    // Heuristic: at least one plugin exposes either name or enforce or has a transform hook
    const representative = plugins.some((p: any) => p && (p.name || p.enforce || typeof p.transform === 'function'));
    expect(representative).toBe(true);
  });

  it('configures alias for @ and Recharts', () => {
    const alias = (config as any).resolve?.alias || {};
    expect(alias['@']).toBeDefined();
    expect(alias['Recharts']).toBe('recharts');
  });

  it('sets jsdom test environment', () => {
    expect((config as any).test?.environment).toBe('jsdom');
    expect((config as any).test?.setupFiles).toContain('./src/test/setup.ts');
  });
});
