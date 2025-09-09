import * as React from 'react';

// Coalesces many "refresh soon" requests under the same key into one call.
// Each key gets a single timer; the latest fn is executed when it fires.
type Fn = () => void | Promise<void>;

const timers = new Map<string, ReturnType<typeof setTimeout>>();
const fns = new Map<string, Fn>();

// --- simple listeners for dev blips ---
type Listener = (key: string) => void;
const listeners = new Set<Listener>();
export function onRefreshFire(fn: Listener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit(key: string) {
  for (const l of listeners) {
    try { l(key); } catch {}
  }
}

export function coalesceRefresh(key: string, fn: Fn, wait = 450) {
  // store latest fn (so most recent refresh logic runs)
  fns.set(key, fn);

  // if a timer exists, reset it
  const existing = timers.get(key);
  if (existing) clearTimeout(existing);

  const t = setTimeout(() => {
    timers.delete(key);
    const toRun = fns.get(key);
    if (toRun) {
      try { void toRun(); } finally { fns.delete(key); }
    }
    emit(key); // notify listeners for dev blips
  }, wait);

  timers.set(key, t);
}

export function cancelCoalesced(key: string) {
  const t = timers.get(key);
  if (t) clearTimeout(t);
  timers.delete(key);
  fns.delete(key);
}

// React hook for a stable scheduler you can call: schedule()
export function useCoalescedRefresh(key: string, fn: Fn, wait = 450) {
  const fnRef = React.useRef(fn);
  React.useEffect(() => { fnRef.current = fn; }, [fn]);

  const schedule = React.useCallback(() => {
    coalesceRefresh(key, () => fnRef.current(), wait);
  }, [key, wait]);

  React.useEffect(() => () => cancelCoalesced(key), [key]);
  return schedule;
}
