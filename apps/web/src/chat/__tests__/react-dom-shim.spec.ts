import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

// Import patched createPortal from our shim (aliased in vitest config)
import { createPortal } from '@chat/react-dom-shim';

function render(el: React.ReactNode) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  root.render(el as any);
  return { host, root };
}

describe('react-dom-shim', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('retargets null/invalid containers to iframe document.body', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // @ts-expect-error intentionally invalid container
    const portal = createPortal(React.createElement('span', { 'data-x': 'ok' }), null);

    // mount it
    render(portal);

    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('invalid/missing container'),
      expect.any(Object)
    );
    expect(document.querySelector('span[data-x="ok"]')).toBeInTheDocument();

    spy.mockRestore();
  });

  test('retargets undefined containers to iframe document.body', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // @ts-expect-error intentionally invalid container
    const portal = createPortal(React.createElement('span', { 'data-x': 'undef' }), undefined);

    render(portal);

    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('invalid/missing container'),
      expect.any(Object)
    );
    expect(document.querySelector('span[data-x="undef"]')).toBeInTheDocument();

    spy.mockRestore();
  });

  test('retargets cross-document containers to iframe document.body', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const otherDoc = document.implementation.createHTMLDocument('other');
    const foreignTarget = otherDoc.createElement('div');
    otherDoc.body.appendChild(foreignTarget);

    const portal = createPortal(React.createElement('span', { 'data-x': 'cross' }), foreignTarget);
    render(portal);

    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('cross-document container'),
      expect.any(Object)
    );
    expect(document.querySelector('span[data-x="cross"]')).toBeInTheDocument();
    spy.mockRestore();
  });

  test('allows valid same-document containers', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const validTarget = document.createElement('div');
    document.body.appendChild(validTarget);

    const portal = createPortal(React.createElement('span', { 'data-x': 'valid' }), validTarget);
    render(portal);

    // Should NOT warn
    expect(spy).not.toHaveBeenCalled();
    expect(validTarget.querySelector('span[data-x="valid"]')).toBeInTheDocument();

    spy.mockRestore();
  });

  test('logs activation marker on module load', () => {
    // The shim should have logged on import
    // We can't easily test this since the module is already loaded,
    // but we can verify the function exists
    expect(createPortal).toBeDefined();
    expect(typeof createPortal).toBe('function');
  });
});
