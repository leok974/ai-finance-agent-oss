import { setLocale, getLocale, type Locales } from './i18n';

const LS_KEY = 'lm_locale';

export function initLocale() {
  try {
    const saved = localStorage.getItem(LS_KEY) as Locales | null;
    if (saved) { setLocale(saved); return; }
    const nav = (navigator.language || 'en').toLowerCase();
    const cand: Locales = nav.startsWith('es') ? 'en' /* placeholder until es added */ : 'en';
    setLocale(cand);
  } catch {
    // ignore (SSR / restricted env)
  }
}

export function chooseLocale(loc: Locales) {
  setLocale(loc);
  try { localStorage.setItem(LS_KEY, loc); } catch {}
  // simplest strategy: full reload to ensure root-level providers rerender with new strings
  window.location.reload();
}

export function currentLocale(): Locales { return getLocale(); }
