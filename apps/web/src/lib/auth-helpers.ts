// Centralized auth helpers with CSRF bootstrap and retry logic

function getCookie(name: string): string | null {
  try {
    const m = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
    return m ? decodeURIComponent(m[2]) : null;
  } catch {
    return null;
  }
}

/**
 * Ensure a CSRF token cookie exists by calling the CSRF endpoint.
 * Called automatically on 403 CSRF failures.
 */
export async function ensureCsrf(): Promise<void> {
  try {
    await fetch('/api/auth/csrf', {
      credentials: 'include',
      cache: 'no-store',
    });
  } catch (err) {
    console.warn('[auth] CSRF bootstrap failed:', err);
  }
}

/**
 * POST to an auth endpoint with CSRF protection and automatic retry.
 * On 403 (likely missing CSRF), fetches a token and retries once.
 */
export async function postWithCsrf<T = any>(
  url: string,
  body: any,
  options?: RequestInit
): Promise<T> {
  const tryOnce = async (): Promise<Response> => {
    const csrf = getCookie('csrf_token');
    const headers = new Headers(options?.headers || {});
    headers.set('Content-Type', 'application/json');
    if (csrf) headers.set('X-CSRF-Token', csrf);

    return fetch(url, {
      ...options,
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify(body),
      cache: 'no-store',
    });
  };

  let response = await tryOnce();

  // On 403, bootstrap CSRF and retry once
  if (response.status === 403) {
    await ensureCsrf();
    response = await tryOnce();
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status} ${response.statusText} — ${text || '<empty>'}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }
  return (await response.text()) as any;
}

/**
 * GET from an auth endpoint with credentials.
 */
export async function getWithAuth<T = any>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status} ${response.statusText} — ${text || '<empty>'}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }
  return (await response.text()) as any;
}
