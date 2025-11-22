/**
 * Demo script to show finance formatter outputs with realistic sample data.
 * Run: pnpm exec ts-node scripts/financeActions-demo.ts
 */

import {
  formatTopMerchantsDetail,
  formatShowSpikes,
  formatCategorizeUnknowns,
  formatBudgetCheck,
} from "../src/lib/formatters/financeActions";
import type { MonthSummary } from "../src/lib/formatters/finance";

// Create a realistic sample month summary for November 2025
const sampleSummary: MonthSummary = {
  month: "2025-11",
  month_id: "2025-11",
  income: 850.96,
  spend: -1764.39,
  net: -913.43,
  topMerchant: {
    name: "CVS Pharmacy",
    amount: 420.15,
  },
  unknown: {
    amount: 1764.39,
    count: 20,
    top: [
      "VENMO *CASH-OUT",
      "ZELLE TRANSFER",
      "ATM WITHDRAWAL #4521",
    ],
  },
  categories: [
    { name: "Groceries", amount: 542.30, note: "40% of spend" },
    { name: "Restaurants", amount: 385.20, note: "28% of spend" },
    { name: "Shopping", amount: 298.50, note: "22% of spend" },
    { name: "Transport", amount: 138.39, note: "10% of spend" },
  ],
  merchants: [
    { name: "CVS Pharmacy", amount: 420.15, category: "groceries" },
    { name: "Harris Teeter", amount: 312.85, category: "groceries" },
    { name: "Chipotle", amount: 185.40, category: "restaurants" },
    { name: "PlayStation", amount: 159.99, category: "entertainment" },
    { name: "Shell Gas Station", amount: 138.39, category: "transport" },
  ],
  spikes: [
    {
      date: "2025-11-15",
      merchant: "Best Buy",
      amount: 899.99,
      note: "+350% vs prev month avg",
    },
    {
      date: "2025-11-22",
      merchant: "Amazon",
      amount: 234.56,
      note: "+120% vs baseline",
    },
    {
      date: "2025-11-08",
      merchant: "Target",
      amount: 187.23,
      note: "New merchant (first occurrence)",
    },
  ],
};

console.log("╔════════════════════════════════════════════════════════════════════╗");
console.log("║          Finance Formatters Demo - November 2025 Sample           ║");
console.log("╚════════════════════════════════════════════════════════════════════╝\n");

console.log("Sample Data:");
console.log(`  Month: ${sampleSummary.month}`);
console.log(`  Income: $${sampleSummary.income.toFixed(2)}`);
console.log(`  Spend: $${Math.abs(sampleSummary.spend).toFixed(2)}`);
console.log(`  Net: $${sampleSummary.net.toFixed(2)}`);
console.log(`  Unknowns: ${sampleSummary.unknown?.count} txns ($${sampleSummary.unknown?.amount.toFixed(2)})`);
console.log(`  Merchants: ${sampleSummary.merchants?.length}`);
console.log(`  Spikes: ${sampleSummary.spikes?.length}\n`);

console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

console.log("=== 1. Categorize Unknowns ===\n");
const categorizeResult = formatCategorizeUnknowns(sampleSummary, "2025-11");
console.log(categorizeResult);
console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

console.log("=== 2. Top Merchants Detail ===\n");
const merchantsResult = formatTopMerchantsDetail(sampleSummary, "2025-11");
console.log(merchantsResult);
console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

console.log("=== 3. Show Spikes ===\n");
const spikesResult = formatShowSpikes(sampleSummary, "2025-11");
console.log(spikesResult);
console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

console.log("=== 4. Budget Check ===\n");
const budgetResult = formatBudgetCheck(sampleSummary, "2025-11");
console.log(budgetResult);
console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

console.log("✓ All formatters executed successfully");
console.log("✓ Outputs shown above represent the actual UI chip responses\n");
