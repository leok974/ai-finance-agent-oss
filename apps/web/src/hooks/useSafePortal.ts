import { useEffect, useState } from 'react';

/**
 * ⛑️ Hook: Only allow portal creation after complete page load.
 * Prevents React error #185 (hydration mismatch) by ensuring DOM is fully ready.
 * 
 * Returns `true` only after:
 * 1. Browser environment is confirmed (not SSR)
 * 2. Page load is complete (`document.readyState === 'complete'`)
 * 3. `window.load` event has fired
 * 
 * @example
 * function MyPortalComponent() {
 *   const portalReady = useSafePortalReady();
 *   if (!portalReady || !document.body) return null;
 *   return createPortal(<Content />, document.body);
 * }
 */
export function useSafePortalReady() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Only after true browser env AND full page load
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    
    if (document.readyState === 'complete') { 
      setReady(true); 
      return; 
    }

    const onLoad = () => setReady(true);
    window.addEventListener('load', onLoad);
    return () => window.removeEventListener('load', onLoad);
  }, []);

  return ready;
}
