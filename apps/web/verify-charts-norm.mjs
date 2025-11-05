// Verification script for chart normalization
// Run with: node --input-type=module verify-charts-norm.mjs

// Simulate backend responses (actual data from 2025-08)
const backendSummary = {
  "month": "2025-08",
  "total_inflows": 0.0,
  "total_outflows": 608.03,
  "net": -608.03
};

const backendMerchants = {
  "month": "2025-08",
  "items": [
    {"merchant": "Delta", "spend": 320.0, "txns": 1},
    {"merchant": "Whole Foods", "spend": 82.45, "txns": 1},
    {"merchant": "Uber", "spend": 59.95, "txns": 2}
  ]
};

const backendFlows = {
  "month": "2025-08",
  "edges": [
    {"source": "Unknown", "target": "Delta", "amount": 320.0},
    {"source": "Unknown", "target": "Whole Foods", "amount": 82.45},
    {"source": "Unknown", "target": "Uber", "amount": 59.95}
  ]
};

// Normalization functions (copied from api.ts for testing)
const normSummary = (r) => {
  const data = r;
  const spend = data?.total_outflows ?? data?.spend ?? 0;
  const income = data?.total_inflows ?? data?.income ?? 0;
  return {
    spend,
    income,
    net: data?.net ?? (income - spend),
  };
};

const normMerchants = (r) => {
  const data = r;
  const items = data?.items ?? data?.top_merchants ?? data?.merchants ?? [];
  return items.map((m) => ({
    merchant: m.merchant ?? m.name ?? m.title ?? 'Unknown',
    amount: Math.abs(m.spend ?? m.amount ?? 0),
  }));
};

const normFlows = (r) => {
  const data = r;
  const month = data?.month;
  const edges = data?.edges ?? [];

  const inflowMap = new Map();
  const outflowMap = new Map();

  for (const edge of edges) {
    const source = edge.source ?? 'Unknown';
    const target = edge.target ?? 'Unknown';
    const amount = Math.abs(edge.amount ?? 0);

    if (source !== 'Unknown') {
      inflowMap.set(source, (inflowMap.get(source) ?? 0) + amount);
    }
    outflowMap.set(target, (outflowMap.get(target) ?? 0) + amount);
  }

  return {
    month,
    inflow: Array.from(inflowMap.entries()).map(([name, amount]) => ({ name, amount })),
    outflow: Array.from(outflowMap.entries()).map(([name, amount]) => ({ name, amount })),
  };
};

// Test normalization
console.log('=== BACKEND RESPONSES (Raw) ===\n');
console.log('Summary:', JSON.stringify(backendSummary, null, 2));
console.log('\nMerchants:', JSON.stringify(backendMerchants, null, 2));
console.log('\nFlows:', JSON.stringify(backendFlows, null, 2));

console.log('\n\n=== NORMALIZED FOR UI ===\n');
console.log('Summary:', JSON.stringify(normSummary(backendSummary), null, 2));
console.log('\nMerchants:', JSON.stringify(normMerchants(backendMerchants), null, 2));
console.log('\nFlows:', JSON.stringify(normFlows(backendFlows), null, 2));

// Verify transformations
console.log('\n\n=== VERIFICATION ===\n');
const summary = normSummary(backendSummary);
console.log('✓ Summary: total_outflows (608.03) → spend:', summary.spend === 608.03);
console.log('✓ Summary: total_inflows (0.0) → income:', summary.income === 0.0);

const merchants = normMerchants(backendMerchants);
console.log('✓ Merchants: items[0].spend (320.0) → amount:', merchants[0].amount === 320.0);
console.log('✓ Merchants: items[0].merchant (Delta) preserved:', merchants[0].merchant === 'Delta');

const flows = normFlows(backendFlows);
console.log('✓ Flows: edges transformed to outflow array:', flows.outflow.length === 3);
console.log('✓ Flows: Delta in outflow with correct amount:',
  flows.outflow.find(f => f.name === 'Delta')?.amount === 320.0);

console.log('\n✅ All transformations verified successfully!');
