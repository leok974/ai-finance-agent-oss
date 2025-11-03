/// <reference types="node" />

import path from 'path';
import { mkdir } from 'fs/promises';
import { request, type APIRequestContext } from '@playwright/test';
import { apiBase, authBase } from '../utils/env';

const STORAGE_STATE_RELATIVE_PATH = 'tests/e2e/.auth/state.json';
const LOGIN_MAX_ATTEMPTS = 6;
const REGISTER_MAX_ATTEMPTS = 4;

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function seedUserIfPossible(api: APIRequestContext, email: string, password: string, isDev = false) {
  // Try to detect if dev routes are enabled, then seed the user without using public registration.
  try {
    const devBase = `${apiBase()}/dev`;
    const envRes = await api.get(`${devBase}/env`);
    if (!envRes.ok()) return false;
    const info = await envRes.json().catch(() => ({} as any));
    if (!info?.allow_dev_routes) return false;

    const seedRes = await api.post(`${devBase}/seed-user`, {
      headers: { 'Content-Type': 'application/json' },
      data: {
        email,
        password,
        role: isDev ? 'dev' : 'admin',  // seed as admin for gated panels, or dev for PIN-gated dev tools
      },
    });
    return seedRes.ok();
  } catch {
    return false;
  }
}

export default async function globalSetup() {
  // In dev E2E, Vite dev server may not be up yet when globalSetup runs.
  // Talk directly to backend for auth bootstrap.
  const useDev = (process.env.USE_DEV ?? '1') !== '0';
  const API = apiBase();
  const AUTH = authBase();
  const baseURL = API.replace(/\/+$/, '').replace(/\/api$/, '');
  const email = process.env.E2E_EMAIL ?? 'e2e@example.com';
  const password = process.env.E2E_PASSWORD ?? 'e2e-password';
  const storageStatePath = path.join(process.cwd(), STORAGE_STATE_RELATIVE_PATH);

  const api = await request.newContext({ baseURL });
  try {
    async function attemptLogin(api: APIRequestContext, email: string, password: string) {
      let lastStatus = 0; let lastBody = '';
      for (let attempt = 0; attempt < LOGIN_MAX_ATTEMPTS; attempt++) {
        const res = await api.post(`${AUTH}/login`, {
          headers: { 'Content-Type': 'application/json' },
          data: { email, password },
        });
        lastStatus = res.status(); lastBody = await res.text().catch(() => '');
        if (res.ok()) return { ok: true } as const;
        if (lastStatus === 401) return { ok: false, status: lastStatus, body: lastBody } as const;
        if (lastStatus === 429 || lastStatus === 503) { await sleep(400 + attempt * 250); continue; }
        await sleep(250);
      }
      return { ok: false, status: lastStatus, body: lastBody } as const;
    }

    async function ensureRegistered(api: APIRequestContext, email: string, password: string) {
      let lastStatus = 0; let lastBody = '';
      for (let attempt = 0; attempt < REGISTER_MAX_ATTEMPTS; attempt++) {
        const res = await api.post(`${AUTH}/register`, {
          headers: { 'Content-Type': 'application/json' },
          data: { email, password, roles: ['user'] },
        });
        lastStatus = res.status(); lastBody = await res.text().catch(() => '');
        if (res.ok() || lastStatus === 400) return;
        if (lastStatus === 429 || lastStatus === 503) { await sleep(400 + attempt * 250); continue; }
        await sleep(250);
      }
      throw new Error(`/api/auth/register failed: ${lastStatus} ${lastBody.slice(0, 200)}`);
    }

    let loginResult = await attemptLogin(api, email, password);
    if (!loginResult.ok) {
      if (loginResult.status === 401) {
        try {
          await ensureRegistered(api, email, password);
        } catch (e: any) {
          // If public registration is disabled, try the dev seed endpoint as a fallback.
          const msg = String(e?.message || '');
          const regDisabled = msg.includes('register failed') || msg.includes('Registration is currently disabled');
          if (regDisabled) {
            const seeded = await seedUserIfPossible(api, email, password);
            if (!seeded) {
              throw new Error(
                'E2E auth bootstrap failed: registration is disabled and dev seeding is unavailable. ' +
                'Enable ALLOW_DEV_ROUTES=1 and rerun, or pre-create the user and set E2E_EMAIL/E2E_PASSWORD.'
              );
            }
          } else {
            throw e;
          }
        }
        // Retry login after registration or seeding
        loginResult = await attemptLogin(api, email, password);
      }
      if (!loginResult.ok) {
        throw new Error(`auth login failed: ${loginResult.status} ${loginResult.body?.slice?.(0, 200) ?? ''}`);
      }
    }

    await mkdir(path.dirname(storageStatePath), { recursive: true });
    await api.storageState({ path: storageStatePath });

    // Seed Unknowns for Undo specs if dev route exists
    try {
      const seed = await api.post(`${API}/dev/seed-unknowns?count=6`);
      if (seed.ok()) {
        // Verify seeding
        const peek = await api.get(`${API}/dev/unknowns/peek`).catch(() => null);
        if (peek?.ok()) {
          const data = await peek.json();
          console.log('[seed] unknowns count:', data?.count);
        }
      }
    } catch {
      // safe to ignore if not present
    }

    // Seed dev superuser for PIN-gated unlock tests
    try {
      const devEmail = process.env.DEV_E2E_EMAIL || 'dev@example.com';
      const devPassword = process.env.DEV_E2E_PASSWORD || 'dev-password';

      // Only seed if dev credentials are different from regular E2E credentials
      if (devEmail !== email) {
        const seeded = await seedUserIfPossible(api, devEmail, devPassword, true);
        if (seeded) {
          console.log(`[seed] dev superuser created: ${devEmail}`);
        }
      }
    } catch {
      // safe to ignore if dev routes not available
    }
  } finally {
    await api.dispose();
  }
}
