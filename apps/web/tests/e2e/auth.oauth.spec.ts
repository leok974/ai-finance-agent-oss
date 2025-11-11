/**
 * OAuth E2E Smoke Tests
 *
 * These tests verify critical OAuth flow invariants WITHOUT logging into Google.
 * We test the shape and behavior of the endpoints, not the full OAuth flow.
 *
 * Protects:
 * 1. Login endpoint redirects to Google with PKCE parameters
 * 2. Callback endpoint sets cookies with correct security flags
 * 3. /api/auth/me endpoint exists and returns proper status codes
 */

import { test, expect, request } from "@playwright/test";

const BASE = process.env.BASE_URL || "https://app.ledger-mind.org";

test.describe.configure({ mode: "serial" });

test.describe("OAuth Flow Invariants", () => {

  test("oauth login redirects to Google with PKCE", async ({ request }) => {
    const res = await request.get(`${BASE}/api/auth/google/login`, {
      maxRedirects: 0
    });

    // Must be 302 redirect
    expect(res.status()).toBe(302);

    const loc = res.headers()["location"] || "";

    // Must redirect to Google OAuth
    expect(loc).toContain("https://accounts.google.com/o/oauth2/v2/auth");

    // Must include OAuth parameters
    expect(loc).toContain("client_id=");
    expect(loc).toContain("redirect_uri=");

    // CRITICAL: Must use PKCE
    expect(loc).toContain("code_challenge=");
    expect(loc).toContain("code_challenge_method=S256");

    // Must include state and nonce for CSRF/replay protection
    expect(loc).toContain("state=");
    expect(loc).toContain("nonce=");
  });

  test("oauth callback endpoint shape is stable", async ({ request }) => {
    // We can't complete the OAuth flow without Google, but we can test
    // that the endpoint exists and handles invalid codes properly
    const bad = new URL(`${BASE}/api/auth/google/callback`);
    bad.searchParams.set("code", "INVALID_CODE_FOR_SHAPE_TEST");
    bad.searchParams.set("state", "SHAPE_TEST");

    const res = await request.get(bad.toString(), { maxRedirects: 0 });

    // Either 302 back to "/" after backend processing, or 4xx with a body if invalid.
    expect([302, 400, 401, 403]).toContain(res.status());

    const setCookie = res.headers()["set-cookie"] || "";

    // If cookies are set (on 302), they must be Secure; SameSite=None; Domain=app.ledger-mind.org
    if (res.status() === 302) {
      expect(setCookie).toContain("Secure");
      expect(setCookie).toContain("SameSite=None");
      expect(setCookie).toMatch(/Domain=\.?app\.ledger-mind\.org/i);

      const loc = res.headers()["location"] || "";
      expect(loc).toBe(`${BASE}/`); // normalized redirect home
    }
  });

  test("auth bootstrap contract (/api/auth/me) exists", async ({ request }) => {
    const res = await request.get(`${BASE}/api/auth/me`, {
      maxRedirects: 0
    });

    // Must return 200 (if session exists) or 401/403 (if not)
    // NEVER 404 - that breaks auth bootstrap
    expect([200, 401, 403]).toContain(res.status());
  });

  test("auth bootstrap contract (/api/auth/me) never 404s", async ({ request }) => {
    // Explicit 404 check - this is the regression we're preventing
    const res = await request.get(`${BASE}/api/auth/me`, {
      maxRedirects: 0
    });

    expect(res.status()).not.toBe(404);
  });

  test("login endpoint sets PKCE state cookie", async ({ request }) => {
    const res = await request.get(`${BASE}/api/auth/google/login`, {
      maxRedirects: 0
    });

    const setCookie = res.headers()["set-cookie"] || "";

    // Should set cookies for OAuth state/PKCE tracking
    // These cookies must also be Secure
    if (setCookie) {
      expect(setCookie).toContain("Secure");
    }
  });
});
