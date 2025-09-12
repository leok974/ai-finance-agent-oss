const KEY = 'globalMonth'; // format: "YYYY-MM"
const EVT = 'global-month-changed';

export function getGlobalMonth(): string | '' {
  try { return localStorage.getItem(KEY) || ''; } catch { return ''; }
}

export function setGlobalMonth(m: string) {
  try { localStorage.setItem(KEY, m); } catch {}
  window.dispatchEvent(new CustomEvent(EVT, { detail: { month: m } }));
}

export function onGlobalMonthChange(cb: (m: string) => void) {
  function handler(e: any) {
    const m = e?.detail?.month ?? getGlobalMonth();
    cb(m);
  }
  window.addEventListener(EVT, handler);
  return () => window.removeEventListener(EVT, handler);
}
