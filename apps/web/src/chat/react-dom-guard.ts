/**
 * Runtime portal guard for chat iframe
 *
 * Wraps ReactDOM.createPortal to detect and block cross-document portals.
 * Throws with detailed diagnostics when a component tries to portal to parent window.
 *
 * Load this FIRST in chat/main.tsx before any Radix components.
 */

import * as ReactDOM from 'react-dom';

const realCreatePortal = ReactDOM.createPortal;

function isNodeLike(n: any): n is Node {
  return !!n && typeof n.nodeType === 'number' && typeof (n as any).appendChild === 'function';
}

(ReactDOM as any).createPortal = function guarded(node: any, container: any, ...rest: any[]) {
  if (!isNodeLike(container)) {
    console.error('[chat-portal-guard] Non-node container', {
      containerType: typeof container,
      nodeType: container?.nodeType
    });
    throw new Error('Invalid portal container (non-node)');
  }

  const same = container.ownerDocument === document;
  if (!same) {
    console.error('[chat-portal-guard] CROSS-DOC PORTAL', {
      containerDoc: container.ownerDocument?.URL,
      iframeDoc: document.URL,
      containerId: (container as any).id,
      containerClass: (container as any).className,
      nodePreview: (node as any)?.type ?? typeof node,
      stack: new Error().stack
    });
    // Hard fail so we get a readable stack in dev sourcemaps
    throw new Error('Cross-document portal detected - check console for details');
  }

  return (realCreatePortal as any)(node, container, ...rest);
};

// Ensure tree-shaking keeps this
console.info('[react-dom-guard] active - cross-document portals will throw');
export {};
