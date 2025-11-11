/**
 * crossDocumentPortalHotfix.ts - Emergency hotfix for React #185
 *
 * Monkeypatches ReactDOM.createPortal to retarget any cross-document portals
 * to the iframe's document body, preventing React error #185.
 *
 * This is a temporary fix until all Radix/shadcn components are wrapped
 * with proper iframe-scoped Portal providers.
 */

import * as ReactDOM from "react-dom";

export function patchCreatePortalToIframe(doc: Document) {
  const realCreatePortal = ReactDOM.createPortal;

  // @ts-expect-error - intentional monkeypatch for hotfix
  ReactDOM.createPortal = (children: React.ReactNode, container: any, ...rest: any[]) => {
    let target = container;

    // 1) Fix null/undefined/invalid nodes
    const isValidNode =
      target &&
      (target.nodeType === 1 /* ELEMENT_NODE */ ||
        target.nodeType === 11 /* DOCUMENT_FRAGMENT_NODE */);

    if (!isValidNode) {
      console.warn("[portal-hotfix] invalid/missing container → retarget to iframe body", {
        received: target?.nodeType ?? target,
        stack: new Error().stack?.split("\n").slice(1, 4).join("\n"),
      });
      target = doc.body;
    }

    // 2) Fix cross-document containers
    const containerDoc = target.ownerDocument;
    if (containerDoc && containerDoc !== doc) {
      console.warn("[portal-hotfix] cross-document container → retarget to iframe body", {
        nodeName: target?.nodeName,
        href: containerDoc.defaultView?.location?.href,
        expectedHref: doc.defaultView?.location?.href,
        stack: new Error().stack?.split("\n").slice(1, 4).join("\n"),
      });
      target = doc.body;
    }

    return realCreatePortal(children, target, ...rest);
  };

  console.log('[portal-hotfix] createPortal patched for iframe document');
}
