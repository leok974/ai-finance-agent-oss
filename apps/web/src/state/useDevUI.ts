import { useEffect, useState } from 'react';

export function isDevUIEnabled(): boolean {
  try {
    return localStorage.getItem('fa.dev') === '1';
  } catch {
    return false;
  }
}

export function setDevUIEnabled(on: boolean) {
  try {
    if (on) localStorage.setItem('fa.dev', '1');
    else localStorage.removeItem('fa.dev');
    // Fire a custom event so soft listeners can react without storage event (same tab)
    window.dispatchEvent(new CustomEvent('devui:changed', { detail: { value: on } }));
  } catch {
    /* no-op */
  }
}

// Soft toggle that does not mutate localStorage (session-only) – for previewing.
export function setDevUIEnabledSoft(on: boolean) {
  window.dispatchEvent(new CustomEvent('devui:soft', { detail: { value: on } }));
  window.dispatchEvent(new CustomEvent('devui:changed', { detail: { value: on, soft: true } }));
}

/** Hook form (recomputes on visibilitychange / storage so another tab toggle is picked up) */
export function useDevUI(): boolean {
  const [flag, setFlag] = useState(isDevUIEnabled());
  useEffect(() => {
    const sync = () => setFlag(isDevUIEnabled());
    const onChanged = (e: any) => {
      if (e?.detail?.soft) {
        // Reflect soft value without altering persisted state indicator (flag semantics: persisted OR soft value)
        setFlag(true);
      } else {
        sync();
      }
    };
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('storage', sync);
    window.addEventListener('devui:changed', onChanged as EventListener);
    return () => {
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('storage', sync);
      window.removeEventListener('devui:changed', onChanged as EventListener);
    };
  }, []);
  return flag;
}

export function useDevUISoftStatus(): { active: boolean; soft: boolean } {
  const [state, setState] = useState<{active:boolean;soft:boolean}>(() => ({ active: isDevUIEnabled(), soft: false }));
  useEffect(() => {
    const sync = () => setState({ active: isDevUIEnabled(), soft: false });
    const onChanged = (e: any) => {
      if (e?.detail?.soft) {
        setState({ active: true, soft: true });
      } else {
        sync();
      }
    };
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('storage', sync);
    window.addEventListener('devui:changed', onChanged as EventListener);
    return () => {
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('storage', sync);
      window.removeEventListener('devui:changed', onChanged as EventListener);
    };
  }, []);
  return state;
}
