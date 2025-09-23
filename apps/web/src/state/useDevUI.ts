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
  } catch {
    /* no-op */
  }
}

/** Hook form (recomputes on visibilitychange / storage so another tab toggle is picked up) */
export function useDevUI(): boolean {
  const [flag, setFlag] = useState(isDevUIEnabled());
  useEffect(() => {
    const onVis = () => setFlag(isDevUIEnabled());
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('storage', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('storage', onVis);
    };
  }, []);
  return flag;
}
