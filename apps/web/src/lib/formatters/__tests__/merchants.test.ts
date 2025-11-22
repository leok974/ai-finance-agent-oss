import { describe, it, expect } from "vitest";
import {
  getMerchantAliasName,
  getMerchantRawName,
  looksLikeRawDescription,
  type MerchantSummary,
  type TransactionRow,
} from "../merchants";

describe("getMerchantAliasName", () => {
  it("should prefer merchant_display over other fields", () => {
    const row: MerchantSummary = {
      merchant_display: "CVS Pharmacy",
      merchant_canonical: "cvs pharmacy",
      label: "CVS/PHARMACY",
      name: "CVS/PHARMACY #02006",
    };
    expect(getMerchantAliasName(row)).toBe("CVS Pharmacy");
  });

  it("should fall back to merchant_canonical when display missing", () => {
    const row: MerchantSummary = {
      merchant_canonical: "cvs pharmacy",
      label: "CVS/PHARMACY",
      name: "CVS/PHARMACY #02006",
    };
    expect(getMerchantAliasName(row)).toBe("cvs pharmacy");
  });

  it("should use legacy label field as fallback", () => {
    const row: MerchantSummary = {
      label: "Harris Teeter",
      name: "HARRIS TEETER #0085",
    };
    expect(getMerchantAliasName(row)).toBe("Harris Teeter");
  });

  it("should use legacy merchant_key field", () => {
    const row: MerchantSummary = {
      merchant_key: "starbucks",
    };
    expect(getMerchantAliasName(row)).toBe("starbucks");
  });

  it("should use name field as last resort", () => {
    const row: MerchantSummary = {
      name: "Target",
    };
    expect(getMerchantAliasName(row)).toBe("Target");
  });

  it("should return Unknown for empty object", () => {
    const row: MerchantSummary = {};
    expect(getMerchantAliasName(row)).toBe("Unknown");
  });

  it("should return Unknown for null fields", () => {
    const row: MerchantSummary = {
      merchant_display: null,
      merchant_canonical: null,
      label: null,
    };
    expect(getMerchantAliasName(row)).toBe("Unknown");
  });

  it("should handle empty strings as falsy", () => {
    const row: MerchantSummary = {
      merchant_display: "",
      merchant_canonical: "walmart",
    };
    expect(getMerchantAliasName(row)).toBe("walmart");
  });
});

describe("getMerchantRawName", () => {
  it("should prefer description for transaction rows", () => {
    const txn: TransactionRow = {
      description: "CVS/PHARMACY #02006 2006-2525 CENTREVILLEHERNDON",
      merchant: "CVS PHARMACY",
    };
    expect(getMerchantRawName(txn)).toMatch("CVS/PHARMACY #02006");
    expect(getMerchantRawName(txn)).toContain("CENTREVILLEHERNDON");
  });

  it("should fall back to merchant field when description missing", () => {
    const txn: TransactionRow = {
      merchant: "HARRIS TEETER",
    };
    expect(getMerchantRawName(txn)).toBe("HARRIS TEETER");
  });

  it("should return fallback for empty transaction", () => {
    const txn: TransactionRow = {};
    expect(getMerchantRawName(txn)).toBe("Unknown transaction");
  });

  it("should return fallback for null fields", () => {
    const txn: TransactionRow = {
      description: null,
      merchant: null,
    };
    expect(getMerchantRawName(txn)).toBe("Unknown transaction");
  });

  it("should preserve full statement text including address markers", () => {
    const txn: TransactionRow = {
      description: "PLAYSTATION*NETWORK 123-456-7890 CA",
    };
    // Should preserve the full description with phone number
    expect(getMerchantRawName(txn)).toContain("123-456-7890");
    expect(getMerchantRawName(txn)).toContain("PLAYSTATION");
  });
});

describe("looksLikeRawDescription", () => {
  it("should detect store numbers with # prefix", () => {
    expect(looksLikeRawDescription("CVS/PHARMACY #02006")).toBe(true);
    expect(looksLikeRawDescription("HARRIS TEETER #0085")).toBe(true);
    expect(looksLikeRawDescription("STARBUCKS #12345")).toBe(true);
  });

  it("should detect STORE keyword with numbers", () => {
    expect(looksLikeRawDescription("TARGET STORE 1234")).toBe(true);
    expect(looksLikeRawDescription("WALMART STORE 5678")).toBe(true);
  });

  it("should detect long numeric sequences (addresses, phones)", () => {
    expect(looksLikeRawDescription("CVS 2006-2525 CENTREVILLE")).toBe(true);
    expect(looksLikeRawDescription("MERCHANT 12960 HIGHLAND")).toBe(true);
    expect(looksLikeRawDescription("SHOP 123456 MAIN ST")).toBe(true);
  });

  it("should detect multiple slashes", () => {
    expect(looksLikeRawDescription("CVS/PHARMACY/LOCATION")).toBe(true);
    expect(looksLikeRawDescription("A/B/C MERCHANT")).toBe(true);
  });

  it("should NOT flag clean canonical names", () => {
    expect(looksLikeRawDescription("CVS Pharmacy")).toBe(false);
    expect(looksLikeRawDescription("Harris Teeter")).toBe(false);
    expect(looksLikeRawDescription("Starbucks")).toBe(false);
    expect(looksLikeRawDescription("Target")).toBe(false);
    expect(looksLikeRawDescription("Walmart")).toBe(false);
  });

  it("should NOT flag single slash (common in brand names)", () => {
    expect(looksLikeRawDescription("CVS/PHARMACY")).toBe(false);
  });

  it("should handle empty/null input", () => {
    expect(looksLikeRawDescription("")).toBe(false);
    expect(looksLikeRawDescription(null as any)).toBe(false);
  });

  it("should detect real-world noisy examples", () => {
    const noisyExamples = [
      "CVS/PHARMACY #02006 2006-2525 CENTREVILLEHERNDON",  // Has # and long numbers
      "HARRIS TEETER #0085 12960 HIGHLAND CROS",  // Has # and address number
      "WALMART STORE 12345 1234 MAIN STREET",  // Has STORE keyword with number
    ];

    noisyExamples.forEach((example) => {
      expect(looksLikeRawDescription(example)).toBe(true);
    });
  });

  it("should NOT flag clean display names", () => {
    const cleanExamples = [
      "CVS Pharmacy",
      "Harris Teeter",
      "PlayStation",
      "Starbucks",
      "Target",
      "Walmart",
      "Amazon",
      "Whole Foods",
    ];

    cleanExamples.forEach((example) => {
      expect(looksLikeRawDescription(example)).toBe(false);
    });
  });
});
