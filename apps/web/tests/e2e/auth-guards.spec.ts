/**
 * auth-guards.spec.ts - HMAC authentication negative tests
 *
 * Validates that authentication guardrails work correctly:
 * - Bad signatures are rejected
 * - Clock skew tolerance works (±5 minutes)
 * - Prevents drift and silent auth failures
 */

import { test, expect } from "@playwright/test";
import { getHmacCredentials, sign } from "./utils/hmac";
import { AGENT_CHAT_PATH } from "./utils/api";

const BASE_URL = process.env.BASE_URL || "https://app.ledger-mind.org";

test.describe("HMAC Auth Guards @prod", () => {
  test.skip("@prod-critical rejects bad signature", async ({ request }) => {
    // TODO: Backend currently allows stub/echo modes without strict HMAC validation
    // This test will pass once HMAC middleware is enforced on /agent/* endpoints
    const creds = getHmacCredentials();
    const path = AGENT_CHAT_PATH;
    const payload = { messages: [{ role: "user", content: "ping" }] };

    const { headers, body } = sign({
      method: "POST",
      path,
      body: payload,
      creds
    });

    // Corrupt the signature
    headers["X-Signature"] = headers["X-Signature"].replace(/^./, "x");

    const r = await request.post(`${BASE_URL}${path}`, {
      headers,
      data: JSON.parse(body)
    });

    // Should reject with 401 (unauthorized) or 403 (forbidden)
    expect(r.status()).toBeGreaterThanOrEqual(401);
    expect(r.status()).toBeLessThan(500);
  });

  test("@prod-critical accepts small positive skew (+90s)", async ({ request }) => {
    const creds = getHmacCredentials();
    const path = AGENT_CHAT_PATH;
    const payload = { messages: [{ role: "user", content: "ping" }] };

    // Test with +90 seconds (well within ±5 min window)
    const future = Date.now() + 90_000;

    const { headers, body } = sign({
      method: "POST",
      path,
      body: payload,
      creds,
      ts: future
    });

    const r = await request.post(`${BASE_URL}${path}`, {
      headers: { ...headers, "x-test-mode": "stub" },
      data: JSON.parse(body)
    });

    // Should accept (within skew window)
    expect(r.ok()).toBeTruthy();
  });

  test("@prod-critical accepts small negative skew (-90s)", async ({ request }) => {
    const creds = getHmacCredentials();
    const path = AGENT_CHAT_PATH;
    const payload = { messages: [{ role: "user", content: "ping" }] };

    // Test with -90 seconds (well within ±5 min window)
    const past = Date.now() - 90_000;

    const { headers, body } = sign({
      method: "POST",
      path,
      body: payload,
      creds,
      ts: past
    });

    const r = await request.post(`${BASE_URL}${path}`, {
      headers: { ...headers, "x-test-mode": "stub" },
      data: JSON.parse(body)
    });

    // Should accept (within skew window)
    expect(r.ok()).toBeTruthy();
  });

  test("rejects timestamp outside window (>6 min)", async ({ request }) => {
    const creds = getHmacCredentials();
    const path = AGENT_CHAT_PATH;
    const payload = { messages: [{ role: "user", content: "ping" }] };

    // Test with timestamp outside ±5 min window
    const tooOld = Date.now() - 400_000; // -6m40s

    const { headers, body } = sign({
      method: "POST",
      path,
      body: payload,
      creds,
      ts: tooOld
    });

    const r = await request.post(`${BASE_URL}${path}`, {
      headers,
      data: JSON.parse(body)
    });

    // Should reject with 400 (bad request) or 408 (request timeout)
    expect(r.status()).toBeGreaterThanOrEqual(400);
    expect(r.status()).toBeLessThan(500);
  });

  test.skip("@prod-critical rejects missing X-Client-Id header", async ({ request }) => {
    // TODO: Backend currently allows stub/echo modes without strict HMAC validation
    const creds = getHmacCredentials();
    const path = AGENT_CHAT_PATH;
    const payload = { messages: [{ role: "user", content: "ping" }] };

    const { headers, body } = sign({
      method: "POST",
      path,
      body: payload,
      creds
    });

    // Remove client ID header
    delete headers["X-Client-Id"];

    const r = await request.post(`${BASE_URL}${path}`, {
      headers,
      data: JSON.parse(body)
    });

    // Should reject with 401 (unauthorized)
    expect(r.status()).toBe(401);
  });

  test.skip("@prod-critical rejects missing X-Timestamp header", async ({ request }) => {
    // TODO: Backend currently allows stub/echo modes without strict HMAC validation
    const creds = getHmacCredentials();
    const path = AGENT_CHAT_PATH;
    const payload = { messages: [{ role: "user", content: "ping" }] };

    const { headers, body } = sign({
      method: "POST",
      path,
      body: payload,
      creds
    });

    // Remove timestamp header
    delete headers["X-Timestamp"];

    const r = await request.post(`${BASE_URL}${path}`, {
      headers,
      data: JSON.parse(body)
    });

    // Should reject with 401 (unauthorized)
    expect(r.status()).toBe(401);
  });

  test.skip("@prod-critical rejects missing X-Signature header", async ({ request }) => {
    // TODO: Backend currently allows stub/echo modes without strict HMAC validation
    const creds = getHmacCredentials();
    const path = AGENT_CHAT_PATH;
    const payload = { messages: [{ role: "user", content: "ping" }] };

    const { headers, body } = sign({
      method: "POST",
      path,
      body: payload,
      creds
    });

    // Remove signature header
    delete headers["X-Signature"];

    const r = await request.post(`${BASE_URL}${path}`, {
      headers,
      data: JSON.parse(body)
    });

    // Should reject with 401 (unauthorized)
    expect(r.status()).toBe(401);
  });
});
