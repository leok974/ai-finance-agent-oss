export async function fetchJSON<T>(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<T> {
  const res = await fetch(input, init);

  if (res.ok) {
    const ct = res.headers.get('content-type') || '';
    if (!ct.toLowerCase().includes('application/json')) {
      const txt = await res.text().catch(() => '');
      const url = typeof input === 'string' ? input : (input as URL).toString();
      throw new Error(
        `Expected JSON but got "${ct}" on ${url}\n` +
        txt.slice(0, 300)
      );
    }
    return res.json() as Promise<T>;
  }

  let body = '';
  try { body = await res.text(); } catch { /* swallow body read errors */ }
  const url = typeof input === 'string' ? input : (input as URL).toString();
  const detail = (() => {
    try { return JSON.stringify(JSON.parse(body), null, 2).slice(0, 500); } catch { return body.slice(0, 500); }
  })();
  throw new Error(`HTTP ${res.status} ${res.statusText} on ${url}\n${detail}`);
}
