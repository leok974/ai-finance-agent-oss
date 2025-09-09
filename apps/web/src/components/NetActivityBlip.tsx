import * as React from 'react';
import { onRefreshFire } from '../utils/refreshBus';

// in-memory queue of recent events that fades out automatically
type Item = { id: number; key: string; t: number };

export default function NetActivityBlip() {
  const [items, setItems] = React.useState<Item[]>([]);
  const idRef = React.useRef(1);

  React.useEffect(() => {
    // subscribe to refreshBus fires
    const off = onRefreshFire((key) => {
      const id = idRef.current++;
      setItems((prev) => [...prev, { id, key, t: Date.now() }]);
      // auto remove after 1200ms (short & sweet)
      setTimeout(() => {
        setItems((prev) => prev.filter((i) => i.id !== id));
      }, 1200);
    });
    return off;
  }, []);

  // Dev only: hide in production if you want
  if (import.meta.env.PROD) return null;

  return (
    <div className="fixed z-50 bottom-4 left-4 flex flex-col gap-1 pointer-events-none">
      {items.map((it) => (
        <div
          key={it.id}
          className="flex items-center gap-2 px-2 py-1 rounded-xl border border-border bg-card/90 text-xs animate-fade-slide-up"
          title="Coalesced refresh fired"
        >
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
          <span className="opacity-80">{it.key}</span>
        </div>
      ))}
    </div>
  );
}
