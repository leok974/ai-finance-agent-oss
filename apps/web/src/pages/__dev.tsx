import React from 'react';
import { flags } from '@/lib/flags';
import { apiGet } from '@/lib/api';

export default function DevPage() {
  const [me, setMe] = React.useState<any>(null);
  const [health, setHealth] = React.useState<any>(null);

  React.useEffect(() => {
    (async () => {
      try { setMe(await apiGet('/auth/me')); } catch {}
      try { setHealth(await apiGet('/healthz')); } catch {}
    })();
  }, []);

  return (
    <div className="p-4 space-y-3">
      <h2 className="text-xl font-semibold">__dev</h2>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="border rounded-xl p-3">
          <h3 className="font-medium">Env</h3>
          <pre className="text-xs mt-2">{JSON.stringify({
            VITE_API_BASE: import.meta.env.VITE_API_BASE,
          }, null, 2)}</pre>
        </div>
        <div className="border rounded-xl p-3">
          <h3 className="font-medium">Flags</h3>
          <pre className="text-xs mt-2">{JSON.stringify(flags, null, 2)}</pre>
        </div>
        <div className="border rounded-xl p-3 md:col-span-2">
          <h3 className="font-medium">Current User</h3>
          <pre className="text-xs mt-2">{JSON.stringify(me, null, 2)}</pre>
        </div>
        <div className="border rounded-xl p-3 md:col-span-2">
          <h3 className="font-medium">Health</h3>
          <pre className="text-xs mt-2">{JSON.stringify(health, null, 2)}</pre>
        </div>
      </div>
    </div>
  );
}
