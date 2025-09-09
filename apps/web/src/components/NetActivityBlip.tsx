import * as React from 'react';
import { onRefreshFire } from '../utils/refreshBus';

// in-memory queue of recent events that fades out automatically
type Item = { id: number; key: string; t: number; count: number };

// Base Tailwind hues per key; we'll compute shade (500/600/700) from count
const HUE_MAP: Record<string, string> = {
  'unknowns-refresh': 'emerald',
  'suggestions-refresh': 'blue',
  'ml-status-refresh': 'violet',
};

function dotClassFor(key: string, count: number) {
  const hue = HUE_MAP[key] || 'gray';
  // Intensity tiers: 1–2 → 500, 3–5 → 600, 6+ → 700
  const shade =
    count >= 6 ? 700 :
    count >= 3 ? 600 : 500;
  return `bg-${hue}-${shade}`;
}

export default function NetActivityBlip() {
  const [items, setItems] = React.useState<Item[]>([]);
  const idRef = React.useRef(1);

  React.useEffect(() => {
    // subscribe to refreshBus fires with coalesced counts
    const off = onRefreshFire((key, count) => {
      const id = idRef.current++;
      setItems((prev) => [...prev, { id, key, t: Date.now(), count }]);
      // auto remove after 1200ms (short & sweet)
      setTimeout(() => {
        setItems((prev) => prev.filter((i) => i.id !== id));
      }, 1200);
    });
    return () => { off(); };
  }, []);

  // Dev only: hide in production if you want
  if (import.meta.env.PROD) return null;

  return (
    <div className="fixed z-50 bottom-4 left-4 flex flex-col gap-1 pointer-events-none">
      {items.map((it) => (
        <div
          key={it.id}
          className="flex items-center gap-2 px-2 py-1 rounded-xl border border-border bg-card/90 text-xs animate-fade-slide-up"
          title={`Coalesced refresh fired (${it.key}${it.count > 1 ? ` x${it.count}` : ''})`}
        >
          <span
            className={[
              "inline-block w-2 h-2 rounded-full",
              dotClassFor(it.key, it.count),
            ].join(" ")}
          />
          <span className={["opacity-80", it.count >= 6 ? "font-semibold" : ""].join(" ")}>
            {it.key}{it.count > 1 ? ` (x${it.count})` : ''}
          </span>
        </div>
      ))}
    </div>
  );
}
