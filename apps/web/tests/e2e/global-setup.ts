/**
 * Playwright global setup - E2E session minting
 *
 * Automatically mints an authenticated session before tests run.
 * No manual cookie capture needed!
 *
 * Required env vars:
 * - BASE_URL: Production URL (e.g., https://app.ledger-mind.org)
 * - E2E_SESSION_HMAC_SECRET: Shared secret for HMAC signing
 * - E2E_USER: User email (default: e2e@ledgermind.org)
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { request, type FullConfig } from "@playwright/test";
import { getHmacCredentials } from "./utils/hmac";

export default async function globalSetup(config: FullConfig) {
  console.log("[global-setup] Starting E2E session mint...");

  const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:8083';
  const baseUrl = new URL(BASE_URL);
  const TEST_HOST = baseUrl.hostname;          // "127.0.0.1" in local run, "app.ledger-mind.org" in prod
  const TEST_IS_HTTPS = baseUrl.protocol === 'https:';

  console.log(`[global-setup] TEST_HOST: ${TEST_HOST}, HTTPS: ${TEST_IS_HTTPS}`);

  const baseURL = BASE_URL;
  const creds = getHmacCredentials();
  const user = creds.clientId;

  // Skip if no credentials configured
  if (!baseURL) {
    console.log("[global-setup] BASE_URL not set, skipping session mint");
    return;
  }

  console.log(`[global-setup] Minting session for ${user}...`);

  // E2E session endpoint uses simpler signature: HMAC-SHA256(user.ts, secret)
  // NOT the same as /agent/* endpoints (which use canonical string)
  const ts = Math.floor(Date.now() / 1000).toString();
  const msg = `${user}.${ts}`;
  const sig = crypto.createHmac("sha256", creds.secret).update(msg).digest("hex");

  // Create API context with E2E-specific headers
  const ctx = await request.newContext({
    baseURL,
    extraHTTPHeaders: {
      "x-e2e-ts": ts,
      "x-e2e-sig": sig,
    }
  });

  try {
    // Call session mint endpoint
    const r = await ctx.post("/api/e2e/session", {
      data: { user },
      failOnStatusCode: false,
    });

    if (!r.ok()) {
      const text = await r.text();
      throw new Error(`E2E session mint failed: ${r.status()} ${text}`);
    }

    console.log(`[global-setup] Session minted successfully`);

    // Extract cookies from response headers
    const setCookieHeaders = r.headers()["set-cookie"] ?? "";
    const parsedCookies: Array<{
      name: string;
      value: string;
      domain?: string;
      path?: string;
      httpOnly?: boolean;
      secure?: boolean;
      sameSite?: string;
    }> = [];

    if (setCookieHeaders) {
      const cookieLines = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
      for (const line of cookieLines) {
        const parts = line.split(";").map(p => p.trim());
        const [nameValue] = parts;
        if (!nameValue) continue;

        const [name, value] = nameValue.split("=");
        const parsed: any = {
          name,
          value,
        };

        for (const part of parts.slice(1)) {
          const lower = part.toLowerCase();
          if (lower === "httponly") parsed.httpOnly = true;
          else if (lower === "secure") parsed.secure = true;
          else if (lower.startsWith("samesite=")) {
            parsed.sameSite = part.split("=")[1];
          }
          else if (lower.startsWith("domain=")) {
            parsed.domain = part.split("=")[1];
          }
          else if (lower.startsWith("path=")) {
            parsed.path = part.split("=")[1];
          }
        }

        parsedCookies.push(parsed);
      }
    }

    console.log(`[global-setup] Extracted ${parsedCookies.length} cookies from response`);

    // Normalize cookies to the test host
    // Always scope cookies to the host we're actually testing against:
    // - local run:  TEST_HOST = "127.0.0.1"
    // - prod run:   TEST_HOST = "app.ledger-mind.org"
    const cookies = parsedCookies.map((c) => {
      // Normalize sameSite value (capitalize first letter)
      let sameSite: 'Lax' | 'Strict' | 'None' = 'Lax';
      if (c.sameSite) {
        const normalized = c.sameSite.charAt(0).toUpperCase() + c.sameSite.slice(1).toLowerCase();
        if (normalized === 'Lax' || normalized === 'Strict' || normalized === 'None') {
          sameSite = normalized;
        }
      }

      return {
        name: c.name,
        value: c.value,
        domain: TEST_HOST,
        path: c.path ?? '/',
        httpOnly: c.httpOnly ?? true,
        secure: TEST_IS_HTTPS,
        sameSite,
      };
    });

    console.log(`[global-setup] Normalized cookies to domain: ${TEST_HOST}, secure: ${TEST_IS_HTTPS}`);

    // Save storage state directly with normalized cookies
    // We don't navigate because that might trigger server Set-Cookie headers that override our cookies
    const statePath = path.resolve("tests/e2e/.auth/prod-state.json");
    await fs.mkdir(path.dirname(statePath), { recursive: true });

    const storageState = {
      cookies,
      origins: []
    };

    await fs.writeFile(statePath, JSON.stringify(storageState, null, 2));
    console.log(`[global-setup] Storage state saved to ${statePath}`);
    await ctx.dispose();

  } catch (error) {
    console.error("[global-setup] Error:", error);
    await ctx.dispose();
    throw error;
  }
}
