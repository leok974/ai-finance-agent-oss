// apps/web/src/lib/excel.test.ts
import { describe, it, expect } from "vitest";
import { read, utils, write } from "xlsx";
import { normalizeExcelToCsvFile, isExcelFile } from "./excel";

function makeTestWorkbook(): File {
  const data = [
    ["date", "description", "amount"],
    ["2025-11-01", "Test Merchant", "-12.34"],
    ["2025-11-02", "Another Merchant", "-56.78"],
  ];

  const wb = utils.book_new();
  const ws = utils.aoa_to_sheet(data);
  utils.book_append_sheet(wb, ws, "Sheet1");

  const wbout = write(wb, { type: "array", bookType: "xlsx" });
  return new File([wbout], "test.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

describe("normalizeExcelToCsvFile", () => {
  it("converts simple xlsx to csv file", async () => {
    const excelFile = makeTestWorkbook();
    const csvFile = await normalizeExcelToCsvFile(excelFile);

    expect(csvFile.name).toBe("test.csv");
    const text = await csvFile.text();
    expect(text).toContain("date,description,amount");
    expect(text).toContain("Test Merchant");
    expect(text.split("\n").length).toBeGreaterThan(1);
  });

  it("preserves data integrity during conversion", async () => {
    const excelFile = makeTestWorkbook();
    const csvFile = await normalizeExcelToCsvFile(excelFile);

    const text = await csvFile.text();
    const lines = text.trim().split("\n");

    // Should have header + 2 data rows
    expect(lines.length).toBe(3);
    expect(lines[0]).toBe("date,description,amount");
    expect(lines[1]).toBe("2025-11-01,Test Merchant,-12.34");
    expect(lines[2]).toBe("2025-11-02,Another Merchant,-56.78");
  });

  it("throws error for Excel file with empty sheet", async () => {
    const wb = utils.book_new();
    const ws = utils.aoa_to_sheet([]);
    utils.book_append_sheet(wb, ws, "EmptySheet");

    const wbout = write(wb, { type: "array", bookType: "xlsx" });
    const emptySheetFile = new File([wbout], "empty-sheet.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    await expect(normalizeExcelToCsvFile(emptySheetFile)).rejects.toThrow(
      "Excel sheet appears to be empty"
    );
  });

  it("converts .xls extension to .csv in filename", async () => {
    const data = [["header"], ["value"]];
    const wb = utils.book_new();
    const ws = utils.aoa_to_sheet(data);
    utils.book_append_sheet(wb, ws, "Sheet1");

    const wbout = write(wb, { type: "array", bookType: "xls" });
    const xlsFile = new File([wbout], "legacy.xls", {
      type: "application/vnd.ms-excel",
    });

    const csvFile = await normalizeExcelToCsvFile(xlsFile);
    expect(csvFile.name).toBe("legacy.csv");
  });

  it("handles complex data types (numbers, dates)", async () => {
    const data = [
      ["date", "merchant", "amount", "balance"],
      ["2025-11-15", "Coffee Shop", -5.5, 1234.56],
      ["2025-11-16", "Grocery Store", -87.23, 1147.33],
    ];

    const wb = utils.book_new();
    const ws = utils.aoa_to_sheet(data);
    utils.book_append_sheet(wb, ws, "Transactions");

    const wbout = write(wb, { type: "array", bookType: "xlsx" });
    const excelFile = new File([wbout], "transactions.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    const csvFile = await normalizeExcelToCsvFile(excelFile);
    const text = await csvFile.text();

    expect(text).toContain("Coffee Shop");
    expect(text).toContain("-5.5");
    expect(text).toContain("1234.56");
  });
});

describe("isExcelFile", () => {
  it("returns true for .xlsx files", () => {
    const file = new File([], "test.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    expect(isExcelFile(file)).toBe(true);
  });

  it("returns true for .xls files", () => {
    const file = new File([], "legacy.xls", { type: "application/vnd.ms-excel" });
    expect(isExcelFile(file)).toBe(true);
  });

  it("returns false for .csv files", () => {
    const file = new File([], "data.csv", { type: "text/csv" });
    expect(isExcelFile(file)).toBe(false);
  });

  it("returns false for other file types", () => {
    const file = new File([], "document.pdf", { type: "application/pdf" });
    expect(isExcelFile(file)).toBe(false);
  });

  it("is case-insensitive", () => {
    const file1 = new File([], "TEST.XLSX", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const file2 = new File([], "DATA.XLS", { type: "application/vnd.ms-excel" });
    expect(isExcelFile(file1)).toBe(true);
    expect(isExcelFile(file2)).toBe(true);
  });
});
