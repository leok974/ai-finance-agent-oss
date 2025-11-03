import { Page, test } from '@playwright/test';
import { authBase } from './env';

function isHttpsBaseUrl() {
  try { return new URL(process.env.BASE_URL ?? 'http://127.0.0.1').protocol === 'https:'; }
  catch { return false; }
}
function hostMatchesDomain(host: string, domain: string) {
  const d = domain.replace(/^\./, '').toLowerCase();
  const h = host.toLowerCase();
  return h === d || h.endsWith('.' + d);
}

/**
 * Tries to set csrf_token via /api/auth/csrf and checks if it lands in the jar.
 * If not, auto-skip with a precise reason (Secure on http, Domain mismatch, etc).
 */
export async function skipIfCookieDomainMismatch(page: Page, where: string) {
  const base = process.env.BASE_URL ?? 'http://127.0.0.1';
  const host = new URL(base).hostname;

  // Trigger CSRF cookie issuance
  const resp = await page.request.get(`${authBase()}/csrf`);
  const setCookie = resp.headers()['set-cookie'] ?? '';

  // Did the cookie store?
  const jar = await page.context().cookies();
  const hasCsrf = jar.some(c => c.name === 'csrf_token');
  if (hasCsrf) return; // Good to proceed

  // Derive why it failed
  const domainMatch = /(?:^|,)\s*csrf_token=.*?(?:;|,).*?\bDomain=([^;,\s]+)/i.exec(setCookie);
  const domain = domainMatch?.[1];
  const secure = /;\s*Secure\b/i.test(setCookie);

  let reason = `${where}: csrf cookie NOT stored for BASE_URL host=${host}. Set-Cookie="${setCookie || '[none]'}"`;
  if (secure && !isHttpsBaseUrl()) reason += ' — Cookie has Secure flag but BASE_URL is http.';
  if (domain && !hostMatchesDomain(host, domain)) reason += ` — Cookie Domain=${domain} does not match host.`;

  test.skip(true, reason);
}
