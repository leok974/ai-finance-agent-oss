import { useDevUI, setDevUIEnabled, isDevUIEnabled } from '@/state/useDevUI';
import { useCallback } from 'react';

export default function DevModeSwitch() {
  const dev = useDevUI();
  const toggle = useCallback(() => {
    const next = !isDevUIEnabled();
    setDevUIEnabled(next);
    location.reload(); // simple & reliable refresh to propagate flag-dependent code
  }, []);

  return (
    <button
      data-testid="dev-toggle"
      onClick={toggle}
      className={[
        'fixed z-[9998] bottom-3 right-3 select-none',
        'px-3 py-1 rounded-lg border border-border bg-card shadow',
        'text-xs font-medium opacity-70 hover:opacity-100 transition'
      ].join(' ')}
      title={dev ? 'Dev UI is ON — click to turn OFF' : 'Dev UI is OFF — click to turn ON'}
      aria-pressed={dev}
      type="button"
    >
      {dev ? 'Dev: ON' : 'Dev: OFF'}
    </button>
  );
}
