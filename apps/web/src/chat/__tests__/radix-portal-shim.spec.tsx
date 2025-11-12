import { Root as RadixPortal } from '@chat/radix-portal-shim';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { describe, test, expect, beforeEach } from 'vitest';
import { PortalContainerContext } from '@/lib/portalRoot';

function mount(node: React.ReactNode, container = document.body) {
  const host = document.createElement('div');
  container.appendChild(host);
  const root = createRoot(host);
  root.render(node as any);
  return { host, root };
}

describe('radix-portal-shim', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  test('uses explicit container prop', () => {
    const target = document.createElement('div');
    document.body.appendChild(target);

    mount(
      React.createElement(RadixPortal, { container: target },
        React.createElement('div', { 'data-k': 'p' })
      )
    );

    expect(target.querySelector('[data-k="p"]')).toBeInTheDocument();
  });

  test('falls back to context container', () => {
    const ctxTarget = document.createElement('div');
    document.body.appendChild(ctxTarget);

    mount(
      React.createElement(
        PortalContainerContext.Provider,
        { value: ctxTarget as any },
        React.createElement(RadixPortal, null,
          React.createElement('div', { 'data-k': 'ctx' })
        )
      )
    );

    expect(ctxTarget.querySelector('[data-k="ctx"]')).toBeInTheDocument();
  });

  test('falls back to document.body if no container or context', () => {
    mount(
      React.createElement(RadixPortal, null,
        React.createElement('div', { 'data-k': 'fallback' })
      )
    );

    expect(document.body.querySelector('[data-k="fallback"]')).toBeInTheDocument();
  });

  test('adds data-radix-portal attribute', () => {
    const target = document.createElement('div');
    document.body.appendChild(target);

    mount(
      React.createElement(RadixPortal, { container: target },
        React.createElement('span', { 'data-k': 'tagged' })
      )
    );

    const portal = target.querySelector('[data-radix-portal]');
    expect(portal).toBeInTheDocument();
    expect(portal?.getAttribute('data-radix-portal')).toBe('true');
  });

  test('container prop takes precedence over context', () => {
    const ctxTarget = document.createElement('div');
    const propTarget = document.createElement('div');
    document.body.appendChild(ctxTarget);
    document.body.appendChild(propTarget);

    mount(
      React.createElement(
        PortalContainerContext.Provider,
        { value: ctxTarget as any },
        React.createElement(RadixPortal, { container: propTarget },
          React.createElement('div', { 'data-k': 'precedence' })
        )
      )
    );

    // Should be in propTarget, NOT ctxTarget
    expect(propTarget.querySelector('[data-k="precedence"]')).toBeInTheDocument();
    expect(ctxTarget.querySelector('[data-k="precedence"]')).not.toBeInTheDocument();
  });
});
