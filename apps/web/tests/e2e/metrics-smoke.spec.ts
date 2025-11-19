import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'https://app.ledger-mind.org';

test.describe('@prod @metrics', () => {
  test('Prometheus metrics endpoint exposes categorized transactions metric', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/metrics`);
    expect(res.status(), 'metrics endpoint should return 200').toBe(200);

    const body = await res.text();

    // 1) Ensure the core metric exists
    expect(
      body.includes('ledgermind_transactions_categorized_total'),
      'metrics payload should contain ledgermind_transactions_categorized_total',
    ).toBeTruthy();

    // 2) (Stronger check) Ensure Transfers / P2P series exists
    //
    // NOTE: This assumes at least one transaction has been categorized as Transfers / P2P.
    // Once your Zelle/Venmo/Cash App backfill route has run, this should be stable.
    //
    // If it ever fails in a new environment, you can temporarily comment this out or
    // change it to a soft warning.
    const hasP2PSeries =
      /ledgermind_transactions_categorized_total\{[^}]*category="Transfers \/ P2P"[^}]*\}\s+[0-9.eE+-]+/.test(
        body,
      );

    expect(
      hasP2PSeries,
      'metrics should expose at least one Transfers / P2P series; did P2P backfill run?',
    ).toBeTruthy();
  });
});
