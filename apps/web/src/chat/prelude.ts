// --- PRELUDE: runs before any React/Radix code ---
// This file MUST load before chat/main.tsx to prevent React #185

// 1) Ensure portal roots live in THIS iframe document
(function ensureIframeRoots() {
  const doc = document;
  const wantIds = ['__LM_PORTAL_ROOT__', 'radix-portal-root', 'sonner-toaster'];
  for (const id of wantIds) {
    if (!doc.getElementById(id)) {
      const el = doc.createElement('div');
      el.id = id;
      el.style.position = 'fixed';
      el.style.inset = '0';
      el.style.pointerEvents = 'none';
      el.style.zIndex = '2147483647';
      doc.body.appendChild(el);
      console.log(`[portal-guard] created ${id} in iframe document`);
    }
  }
  (window as any).__LM_PORTAL_ROOT__ = document.getElementById('__LM_PORTAL_ROOT__');
  (window as any).__REACT_PORTAL_GUARD__ = true;
  console.log('[portal-guard] iframe roots ensured');
})();

// 2) Monkey-patch createPortal BEFORE ReactDOM is imported anywhere
(function patchCreatePortalEarly() {
  const apply = (ReactDOM: any) => {
    if (!ReactDOM || ReactDOM.__lmPatched) return;
    const orig = ReactDOM.createPortal?.bind(ReactDOM);
    if (!orig) return;

    ReactDOM.createPortal = function guarded(children: any, container: any, ...rest: any[]) {
      const ok = container && container.nodeType === 1 && container.ownerDocument === document;
      if (!ok) {
        const fallback = (window as any).__LM_PORTAL_ROOT__ || document.body;
        console.warn('[portal-guard] bad container; rerouting to __LM_PORTAL_ROOT__', {
          container,
          ownerDoc: container?.ownerDocument,
          thisDoc: document,
          nodeType: container?.nodeType
        });
        return orig(children, fallback, ...rest);
      }
      return orig(children, container, ...rest);
    };
    ReactDOM.__lmPatched = true;
    console.log('[portal-guard] ReactDOM.createPortal patched');
  };

  if ((window as any).ReactDOM) apply((window as any).ReactDOM);

  let _reactdom: any;
  Object.defineProperty(window as any, 'ReactDOM', {
    configurable: true,
    get() { return _reactdom; },
    set(v) { _reactdom = v; apply(v); }
  });

  queueMicrotask(() => {
    if ((window as any).ReactDOM) apply((window as any).ReactDOM);
  });
})();
