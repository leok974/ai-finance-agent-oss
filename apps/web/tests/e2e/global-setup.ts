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

  const baseURL = process.env.BASE_URL;
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
    const cookies: Array<{name: string, value: string, domain: string, path: string, httpOnly?: boolean, secure?: boolean, sameSite?: "Lax" | "None" | "Strict"}> = [];

    if (setCookieHeaders) {
      const cookieLines = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
      for (const line of cookieLines) {
        const parts = line.split(";").map(p => p.trim());
        const [nameValue] = parts;
        if (!nameValue) continue;

        const [name, value] = nameValue.split("=");
        const cookie: any = {
          name,
          value,
          domain: "app.ledger-mind.org",
          path: "/",
        };

        for (const part of parts.slice(1)) {
          const lower = part.toLowerCase();
          if (lower === "httponly") cookie.httpOnly = true;
          else if (lower === "secure") cookie.secure = true;
          else if (lower.startsWith("samesite=")) {
            const val = part.split("=")[1];
            cookie.sameSite = val as "Lax" | "None" | "Strict";
          }
          else if (lower.startsWith("domain=")) {
            cookie.domain = part.split("=")[1];
          }
          else if (lower.startsWith("path=")) {
            cookie.path = part.split("=")[1];
          }
        }

        cookies.push(cookie);
      }
    }

    console.log(`[global-setup] Extracted ${cookies.length} cookies from response`);

    // Create browser context with cookies pre-loaded
    const { chromium } = await import("@playwright/test");
    const browser = await chromium.launch();
    const browserContext = await browser.newContext({
      baseURL,
    });

    // Add cookies to browser context
    await browserContext.addCookies(cookies);

    console.log(`[global-setup] Added cookies to browser context`);

    const page = await browserContext.newPage();

    // Navigate to home page to activate session
    const home = await page.goto("/");

    if (!home?.ok()) {
      throw new Error(`Failed to load home: ${home?.status()}`);
    }

    console.log(`[global-setup] Home page loaded, persisting storage state...`);

    // Save storage state (cookies + localStorage)
    const statePath = path.resolve("tests/e2e/.auth/prod-state.json");
    await fs.mkdir(path.dirname(statePath), { recursive: true });
    await browserContext.storageState({ path: statePath });

    console.log(`[global-setup] Storage state saved to ${statePath}`);

    await browser.close();
    await ctx.dispose();

  } catch (error) {
    console.error("[global-setup] Error:", error);
    await ctx.dispose();
    throw error;
  }
}
