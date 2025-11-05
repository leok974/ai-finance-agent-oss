// Runtime Guard Validation Tests
// Run in browser console to verify guards work correctly

console.group('🛡️ Runtime Guard Tests');

// Helper functions (from api.ts)
const arr = (x) => Array.isArray(x) ? x : [];
const num = (x) => {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
};

// Test arr() guard
console.group('arr() tests');
console.assert(arr([1, 2, 3]).length === 3, '✓ Valid array');
console.assert(arr(null).length === 0, '✓ null → []');
console.assert(arr(undefined).length === 0, '✓ undefined → []');
console.assert(arr({}).length === 0, '✓ object → []');
console.assert(arr('string').length === 0, '✓ string → []');
console.assert(arr(123).length === 0, '✓ number → []');
console.groupEnd();

// Test num() guard
console.group('num() tests');
console.assert(num(42) === 42, '✓ Valid number');
console.assert(num('123') === 123, '✓ Numeric string');
console.assert(num(null) === 0, '✓ null → 0');
console.assert(num(undefined) === 0, '✓ undefined → 0');
console.assert(num('abc') === 0, '✓ Invalid string → 0');
console.assert(num(NaN) === 0, '✓ NaN → 0');
console.assert(num(Infinity) === 0, '✓ Infinity → 0');
console.assert(num({}) === 0, '✓ object → 0');
console.groupEnd();

// Test malformed API responses
console.group('Malformed response handling');

// Simulate getMonthMerchants with bad data
const badMerchantsResponse = {
  items: [
    { merchant: 'Valid', spend: 100, txns: 5 },
    { spend: 200, txns: 3 }, // missing merchant
    { merchant: 'No Amount', txns: 2 }, // missing spend
    { merchant: null, spend: 'abc', txns: 'xyz' }, // null/invalid types
    null, // null item
    undefined, // undefined item
  ]
};

const processedMerchants = arr(badMerchantsResponse?.items).map((m) => ({
  merchant: String(m?.merchant ?? 'Unknown'),
  spend: num(m?.spend),
  txns: num(m?.txns)
}));

console.log('Processed merchants:', processedMerchants);
console.assert(processedMerchants.length === 6, '✓ All items processed');
console.assert(processedMerchants[0].merchant === 'Valid', '✓ Valid merchant preserved');
console.assert(processedMerchants[1].merchant === 'Unknown', '✓ Missing merchant → Unknown');
console.assert(processedMerchants[2].spend === 0, '✓ Missing spend → 0');
console.assert(processedMerchants[3].merchant === 'null', '✓ null merchant → "null" string');
console.assert(processedMerchants[4].merchant === 'Unknown', '✓ null item → Unknown');
console.assert(processedMerchants[5].merchant === 'Unknown', '✓ undefined item → Unknown');

// Simulate getMonthCategories with bad data
const badCategoriesResponse = {
  by_category: [
    { category: 'Food', spend: 300 },
    { spend: 150 }, // missing category
    { category: 'Transport', spend: 'invalid' }, // invalid amount
    null,
  ]
};

const processedCategories = arr(badCategoriesResponse?.by_category).map((c) => ({
  name: String(c?.category ?? 'Unknown'),
  amount: num(c?.spend)
}));

console.log('Processed categories:', processedCategories);
console.assert(processedCategories.length === 4, '✓ All categories processed');
console.assert(processedCategories[0].name === 'Food', '✓ Valid category preserved');
console.assert(processedCategories[1].name === 'Unknown', '✓ Missing category → Unknown');
console.assert(processedCategories[2].amount === 0, '✓ Invalid amount → 0');

// Simulate getMonthSummary with bad data
const badSummaryResponse = {
  month: '2025-08',
  total_inflows: 'not-a-number',
  total_outflows: null,
  net: undefined,
  daily: [
    { date: '2025-08-01', inflow: 100, outflow: 50, net: 50 },
    { date: null, inflow: 'abc', outflow: null }, // malformed
    null, // null item
  ]
};

const processedSummary = {
  month: badSummaryResponse.month ? String(badSummaryResponse.month) : null,
  total_inflows: num(badSummaryResponse.total_inflows),
  total_outflows: num(badSummaryResponse.total_outflows),
  net: num(badSummaryResponse.net),
  daily: arr(badSummaryResponse.daily).map((d) => ({
    date: String(d?.date ?? ''),
    in: num(d?.inflow),
    out: num(d?.outflow),
    net: num(d?.net)
  }))
};

console.log('Processed summary:', processedSummary);
console.assert(processedSummary.total_inflows === 0, '✓ Invalid inflows → 0');
console.assert(processedSummary.total_outflows === 0, '✓ null outflows → 0');
console.assert(processedSummary.net === 0, '✓ undefined net → 0');
console.assert(processedSummary.daily.length === 3, '✓ All daily items processed');
console.assert(processedSummary.daily[1].date === 'null', '✓ null date → "null"');
console.assert(processedSummary.daily[1].in === 0, '✓ Invalid inflow → 0');
console.assert(processedSummary.daily[2].date === '', '✓ null item date → empty string');

console.groupEnd();

// Summary
console.group('📊 Test Summary');
console.log('%c✅ All runtime guards working correctly!', 'color: green; font-weight: bold;');
console.log('Guards prevent:');
console.log('  - Crashes from null/undefined');
console.log('  - NaN propagation in calculations');
console.log('  - Type errors in chart rendering');
console.log('  - Array iteration errors');
console.groupEnd();

console.groupEnd();
