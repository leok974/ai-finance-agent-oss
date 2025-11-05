import { test, expect } from "@playwright/test";

// Smoke test for ML suggestions endpoint
// Assumes at least one transaction exists in test environment
// Use E2E_TXN_ID env var to provide a real transaction ID from your test data

const TEST_TXN_ID = process.env.E2E_TXN_ID || "1";  // Default to ID 1 for smoke test

test("suggestions endpoint returns candidates", async ({ request }) => {
  const res = await request.post("/agent/tools/suggestions", {
    data: {
      txn_ids: [TEST_TXN_ID],
      top_k: 3,
      mode: "auto"  // Use auto mode to test full pipeline
    },
  });

  expect(res.ok()).toBeTruthy();

  const json = await res.json();
  expect(json).toHaveProperty("items");
  expect(Array.isArray(json.items)).toBe(true);

  if (json.items.length > 0) {
    const firstItem = json.items[0];
    expect(firstItem).toHaveProperty("txn_id");
    expect(firstItem).toHaveProperty("candidates");
    expect(Array.isArray(firstItem.candidates)).toBe(true);

    // Heuristic suggester always returns at least one candidate (fallback)
    expect(firstItem.candidates.length).toBeGreaterThan(0);

    // Check candidate structure
    const firstCandidate = firstItem.candidates[0];
    expect(firstCandidate).toHaveProperty("label");
    expect(firstCandidate).toHaveProperty("confidence");
    expect(firstCandidate).toHaveProperty("reasons");
    expect(typeof firstCandidate.label).toBe("string");
    expect(typeof firstCandidate.confidence).toBe("number");
    expect(Array.isArray(firstCandidate.reasons)).toBe(true);
  }
});

test("suggestions feedback endpoint accepts feedback", async ({ request }) => {
  // First, create a suggestion to get an event_id

  const suggestRes = await request.post("/agent/tools/suggestions", {
    data: {
      txn_ids: [TEST_TXN_ID],
      top_k: 1,
      mode: "auto"
    },
  });

  expect(suggestRes.ok()).toBeTruthy();
  const suggestJson = await suggestRes.json();

  if (suggestJson.items && suggestJson.items.length > 0 && suggestJson.items[0].event_id) {
    const eventId = suggestJson.items[0].event_id;

    // Send feedback
    const feedbackRes = await request.post("/agent/tools/suggestions/feedback", {
      data: {
        event_id: eventId,
        action: "accept",
        reason: "test feedback",
      },
    });

    expect(feedbackRes.ok()).toBeTruthy();
    const feedbackJson = await feedbackRes.json();
    expect(feedbackJson).toHaveProperty("ok");
    expect(feedbackJson.ok).toBe(true);
  }
});
