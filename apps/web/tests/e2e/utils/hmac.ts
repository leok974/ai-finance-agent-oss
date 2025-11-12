/**
 * Unified HMAC-SHA256 authentication utilities
 *
 * Shared by:
 * - Global setup (session minting)
 * - API tests (direct HMAC auth)
 * - Dev scripts (smoke tests)
 *
 * Canonical string format: <METHOD>\n<PATH>\n<TIMESTAMP>\n<BODY_SHA256>
 */
import crypto from "node:crypto";

export type HmacCreds = {
  clientId: string;           // E2E_USER or HMAC_CLIENT_ID
  secret: string;             // E2E_SESSION_HMAC_SECRET or HMAC_SECRET
  skewMs?: number;            // default 300000 (±5m)
  digest?: "hex" | "base64";  // default "hex"
};

/**
 * Gets HMAC credentials from environment with validation.
 * Supports both legacy E2E naming and new HMAC naming:
 * - E2E_USER / E2E_SESSION_HMAC_SECRET (existing)
 * - HMAC_CLIENT_ID / HMAC_SECRET (new)
 */
export function getHmacCredentials(): HmacCreds {
  const clientId = process.env.HMAC_CLIENT_ID || process.env.E2E_USER || "";
  const secret   = process.env.HMAC_SECRET || process.env.E2E_SESSION_HMAC_SECRET || "";

  if (!clientId || !secret) {
    throw new Error("Missing HMAC credentials (clientId/secret).");
  }

  return {
    clientId,
    secret,
    skewMs: 300_000,  // ±5 minutes
    digest: "hex"
  };
}

/**
 * SHA-256 hash of string, returned as lowercase hex.
 */
export function sha256Hex(s: string): string {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}

/**
 * Generate HMAC-SHA256 signature for API request.
 *
 * @param method - HTTP method (GET, POST, etc.)
 * @param path - Request path (e.g., /agent/chat)
 * @param body - Request body (object, string, or undefined)
 * @param creds - HMAC credentials
 * @param ts - Timestamp in milliseconds (defaults to Date.now())
 * @returns Object with headers and serialized body
 *
 * @example
 * const creds = getHmacCredentials();
 * const { headers, body } = sign({
 *   method: "POST",
 *   path: "/agent/chat",
 *   body: { messages: [...] },
 *   creds
 * });
 * await request.post(url, { headers, data: JSON.parse(body) });
 */
export function sign(params: {
  method: string;
  path: string;
  body?: any;
  creds: HmacCreds;
  ts?: number;
}) {
  const { method, path, body, creds, ts } = params;

  // Serialize body (empty string if no body)
  const raw = body
    ? (typeof body === "string" ? body : JSON.stringify(body))
    : "";

  const timestamp = (ts ?? Date.now()).toString();
  const bodyHash = sha256Hex(raw);

  // Canonical string: <METHOD>\n<PATH>\n<TIMESTAMP>\n<BODY_SHA256>
  const canonical = `${method.toUpperCase()}\n${path}\n${timestamp}\n${bodyHash}`;

  // Generate HMAC signature
  const sig = crypto
    .createHmac("sha256", creds.secret)
    .update(canonical, "utf8")
    .digest(creds.digest ?? "hex");

  return {
    headers: {
      "X-Client-Id": creds.clientId,
      "X-Timestamp": timestamp,
      "X-Signature": sig,
      "Content-Type": "application/json",
    },
    body: raw,
  };
}
