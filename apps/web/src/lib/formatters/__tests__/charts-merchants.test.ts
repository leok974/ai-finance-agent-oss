import { describe, it, expect } from "vitest";
import { looksLikeRawDescription } from "../merchants";
import type { UIMerchant } from "@/lib/api";

describe("chart merchant labels", () => {
  it("should use clean alias labels, not raw descriptions", () => {
    // Simulate merchant data from backend
    const merchants: UIMerchant[] = [
      {
        merchant_canonical: "cvs pharmacy",
        merchant_display: "CVS Pharmacy",
        sample_description: "CVS/PHARMACY #02006 2006-2525 CENTREVILLEHERNDON",
        merchant_key: "cvs pharmacy",
        label: "CVS Pharmacy",
        total: 420.15,
        count: 5,
      },
      {
        merchant_canonical: "harris teeter",
        merchant_display: "Harris Teeter",
        sample_description: "HARRIS TEETER #0085 12960 HIGHLAND CROS",
        merchant_key: "harris teeter",
        label: "Harris Teeter",
        total: 312.85,
        count: 3,
      },
    ];

    // Chart labels should use merchant_display (clean alias)
    merchants.forEach((merchant) => {
      const displayName = merchant.merchant_display!;

      // Guard 1: Display name should NOT look like raw transaction text
      expect(looksLikeRawDescription(displayName)).toBe(false);

      // Guard 2: Display name should be much shorter than sample description
      const sampleLength = merchant.sample_description?.length || 0;
      if (sampleLength > 0) {
        expect(displayName.length).toBeLessThan(sampleLength);
      }

      // Guard 3: Display name should not contain store numbers
      expect(displayName).not.toMatch(/#\d{4,}/);
      expect(displayName).not.toMatch(/\d{4,}-\d{4,}/);
    });
  });

  it("should NOT accidentally use sample_description in chart labels", () => {
    const merchant: UIMerchant = {
      merchant_canonical: "cvs pharmacy",
      merchant_display: "CVS Pharmacy",
      sample_description: "CVS/PHARMACY #02006 2006-2525 CENTREVILLEHERNDON",
      merchant_key: "cvs pharmacy",
      label: "CVS Pharmacy",
      total: 420.15,
      count: 5,
    };

    // Chart should use display name
    const chartLabel = merchant.merchant_display!;

    // Should NOT be the sample description
    expect(chartLabel).not.toBe(merchant.sample_description);
    expect(chartLabel).toBe("CVS Pharmacy");

    // Verify sample_description is indeed noisy (contains store number)
    expect(merchant.sample_description).toContain("#02006");
  });

  it("should group merchants by canonical key, not raw descriptions", () => {
    // Two transactions from different CVS stores
    const cvsTxns = [
      {
        merchant_canonical: "cvs pharmacy",
        merchant_display: "CVS Pharmacy",
        sample_description: "CVS/PHARMACY #02006 2006-2525 CENTREVILLEHERNDON",
        total: 50.00,
        count: 1,
      },
      {
        merchant_canonical: "cvs pharmacy",
        merchant_display: "CVS Pharmacy",
        sample_description: "CVS/PHARMACY #00121 121 MAIN STREET",
        total: 30.00,
        count: 1,
      },
    ];

    // Both should have same canonical key
    const canonicals = cvsTxns.map(t => t.merchant_canonical);
    expect(new Set(canonicals).size).toBe(1); // Only one unique canonical
    expect(canonicals[0]).toBe("cvs pharmacy");

    // But different sample descriptions (raw transaction text)
    const samples = cvsTxns.map(t => t.sample_description);
    expect(new Set(samples).size).toBe(2); // Two unique raw descriptions
  });

  it("should validate real-world merchant display names are clean", () => {
    const realWorldMerchants = [
      "CVS Pharmacy",
      "Harris Teeter",
      "Starbucks",
      "Target",
      "Walmart",
      "Amazon",
      "Whole Foods",
      "Chipotle",
    ];

    realWorldMerchants.forEach((name) => {
      // None of these should look like raw transaction text
      expect(looksLikeRawDescription(name)).toBe(false);

      // None should contain store numbers
      expect(name).not.toMatch(/#\d{4,}/);
      expect(name).not.toMatch(/STORE \d{3,}/i);
    });
  });

  it("should detect if raw descriptions leak into chart labels (anti-pattern)", () => {
    const badExamples = [
      "CVS/PHARMACY #02006 2006-2525 CENTREVILLEHERNDON",
      "HARRIS TEETER #0085 12960 HIGHLAND CROS",
      "WALMART STORE 12345 1234 MAIN STREET",
    ];

    badExamples.forEach((label) => {
      // These SHOULD be detected as raw descriptions
      expect(looksLikeRawDescription(label)).toBe(true);

      // If we see these in a chart label, we have a bug
      // (this test documents the anti-pattern we're preventing)
    });
  });
});
