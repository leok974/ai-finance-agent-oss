// apps/web/src/lib/excel.ts
import { read, utils } from "xlsx";

/**
 * Convert an Excel file (.xls/.xlsx) into a CSV File so it can go through
 * the existing CSV ingest pipeline unchanged.
 *
 * - Uses the first worksheet.
 * - Preserves header row as-is (backend mapping/heuristics still apply).
 */
export async function normalizeExcelToCsvFile(original: File): Promise<File> {
  const arrayBuffer = await original.arrayBuffer();

  const workbook = read(arrayBuffer, { type: "array" });
  if (!workbook.SheetNames.length) {
    throw new Error("Excel file has no worksheets");
  }

  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  // Convert sheet to CSV string
  const csv = utils.sheet_to_csv(sheet, {
    FS: ",",
    RS: "\n",
    // You can tweak here if you hit locale issues, but this is usually fine.
  });

  if (!csv.trim()) {
    throw new Error("Excel sheet appears to be empty");
  }

  const csvBlob = new Blob([csv], { type: "text/csv" });
  const csvName = original.name.replace(/\.(xlsx|xls)$/i, ".csv");

  return new File([csvBlob], csvName, { type: "text/csv" });
}

/**
 * Quick type guard for Excel file extensions.
 */
export function isExcelFile(file: File): boolean {
  return /\.xlsx?$/i.test(file.name);
}
