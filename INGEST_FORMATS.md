# LedgerMind Ingest Formats

## Overview

LedgerMind ingests **bank and card statements** into a canonical `transactions` table
and then drives charts, suggestions, and chat tools from there.

To keep the ingest pipeline maintainable, we normalize all input formats into a
single internal representation (`TransactionIngestRow`) and re-use the same mapping
and validation logic regardless of the original file type.

This document describes:

- Which formats are supported today
- How Excel support works
- What formats we plan to support next

---

## Supported Formats (User-Facing)

### ✅ CSV (`.csv`)

**Status:** First-class, fully supported.

- **Upload:** via web UI "Upload Statement" flow
- **Parsing:** Backend CSV ingest pipeline
- **Mapping:** Header-based + heuristic mapping into `transactions`
- **Usage:** All charts, suggestions, and tools use this as the source of truth

**Notes:**

- CSV is the only format the backend actually parses today.
- All other formats are normalized into CSV (client-side) before ingest.

---

### ✅ Excel (`.xls`, `.xlsx`)

**Status:** Fully supported via frontend normalization.

From the user's perspective, LedgerMind supports **native Excel uploads**:

- You can upload `.xls` or `.xlsx` directly in the UI.
- The app converts Excel → CSV in the browser, then sends CSV to the existing ingest endpoint.

**Implementation details:**

- Frontend helper: `apps/web/src/lib/excel.ts`

  ```ts
  import { read, utils } from "xlsx";

  export async function normalizeExcelToCsvFile(original: File): Promise<File> {
    const arrayBuffer = await original.arrayBuffer();
    const workbook = read(arrayBuffer, { type: "array" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const csv = utils.sheet_to_csv(sheet, { FS: ",", RS: "\n" });

    const csvBlob = new Blob([csv], { type: "text/csv" });
    const csvName = original.name.replace(/\.(xlsx|xls)$/i, ".csv");

    return new File([csvBlob], csvName, { type: "text/csv" });
  }
  ```

- The upload component accepts: `.csv, .xls, .xlsx`

- When an Excel file is selected:

  1. `normalizeExcelToCsvFile()` is called in the browser
  2. The resulting CSV File runs through the same backend ingest path as any CSV

**Why frontend normalization?**

- Keeps backend ingest logic single-source-of-truth.
- Avoids adding heavy Excel parsing dependencies to the API.
- Makes testing simpler: backend tests only care about CSV.

---

## Internals: Ingest Pipeline

Regardless of input format, the backend ultimately sees a CSV stream with columns like:

- `date` / `posted_at`
- `description`
- `amount`
- `currency`
- `account` / `account_name`
- Optional: `category`, `balance`, `fitid`, etc.

The ingest pipeline:

1. Parses CSV rows into a `TransactionIngestRow` struct
2. Applies bank-specific and generic normalization (merchant name cleanup, sign conventions)
3. Inserts rows into `transactions` with metadata about the upload

This pipeline is used for both:

- Local dev/test uploads
- Production uploads from the SPA

---

## Planned Formats

These formats are not supported yet, but are on the roadmap.

### 🟦 OFX / QFX (Open Financial Exchange / Quicken)

**Status:** Planned.

- Many US banks support OFX/QFX exports.
- They provide structured transaction data (date, amount, memo, FITID, balances).

**Planned approach:**

- New parser module (e.g. `app/ingest/ofx_parser.py`)
- Either:
  - A dedicated endpoint (`POST /ingest/ofx`), or
  - Auto-detection in existing `/ingest` based on Content-Type / file extension
- Output: internal `TransactionIngestRow` list, then reuse CSV ingest mapping logic

### 🟨 QIF (Quicken Interchange Format)

**Status:** "Nice-to-have".

- Text-based legacy format still used by some banks and budgeting tools.
- Will be considered after OFX/QFX based on real user demand.

### 🟨 MT940 / CAMT.053 (SWIFT / SEPA / business statements)

**Status:** Long-term.

- Used by European banks and business accounts.
- Powerful but more complex to parse.
- Likely to be handled by a dedicated parser + strong test corpus if we target SMB users.

---

## Out-of-Scope for Now

### ❌ PDF Statements

PDFs are layout-oriented, not data-oriented.

- Parsing requires OCR and layout heuristics that are brittle and bank-specific.
- These may be explored later as a premium or research feature, but are explicitly out of scope for core ingest.

---

## Testing & QA

### Unit / component tests

**`apps/web/src/lib/excel.test.ts`** verifies:

- Excel files are detected by extension (`isExcelFile`)
- `normalizeExcelToCsvFile()` produces a sane CSV File with headers and rows
- Error handling for empty sheets and missing worksheets
- Data integrity preservation (numbers, dates, text)

**Coverage:**

- ✅ 10 unit tests, all passing
- ✅ Tests `.xlsx` and `.xls` formats
- ✅ Validates CSV output format and content

### E2E tests

**`apps/web/tests/e2e/upload-excel.spec.ts`** (Playwright) validates that:

- Uploading a `.xlsx` fixture through the UI succeeds
- Charts panel renders after ingest
- Either bars or a controlled empty state appears for top merchants
- Error messages display correctly for empty/malformed files

**Test fixtures:**

- `apps/web/tests/fixtures/test-transactions.xlsx` - 3 sample transactions
- `apps/web/tests/fixtures/empty.xlsx` - Empty sheet error handling
- `apps/web/tests/fixtures/test-transactions-legacy.xls` - Legacy format support

---

## Summary

**Today:**

- ✅ CSV → Fully supported (backend pipeline)
- ✅ Excel (`.xls`/`.xlsx`) → Supported via frontend Excel→CSV normalization

**Next up (planned):**

- 🟦 OFX/QFX → Native parsing into the ingest pipeline
- 🟨 QIF, MT940/CAMT.053 → Based on demand and target users

All formats ultimately map into the same internal transaction schema, so charts, suggestions, and chat tools don't need to care where the data came from.

---

## Architecture Benefits

1. **Single Source of Truth**: Backend only processes CSV
2. **Client-Side Processing**: No server load for Excel/future format parsing
3. **Maintainability**: One ingest pipeline, multiple input normalizers
4. **Testing**: Backend tests focus on CSV logic, frontend tests focus on format conversion
5. **Performance**: Large file parsing happens in browser (distributes load)
6. **Flexibility**: Easy to add new formats by creating new normalizers

---

## For Developers: Adding a New Format

To add support for a new file format (e.g., OFX):

1. **Frontend normalizer** (if client-side):
   - Create `apps/web/src/lib/{format}.ts`
   - Implement `normalize{Format}ToCsvFile(file: File): Promise<File>`
   - Add unit tests in `{format}.test.ts`

2. **Update UploadCsv component**:
   - Add file extension to `accept` attribute
   - Add format detection and normalization logic
   - Update error messages

3. **Add E2E tests**:
   - Create test fixtures in `apps/web/tests/fixtures/`
   - Create `tests/e2e/upload-{format}.spec.ts`

4. **Documentation**:
   - Update this file
   - Add format-specific notes to `apps/web/EXCEL_UPLOAD_IMPLEMENTATION.md`

5. **Backend parser** (if server-side):
   - Create `apps/backend/app/ingest/{format}_parser.py`
   - Add endpoint or auto-detection logic
   - Convert to `TransactionIngestRow` and reuse existing pipeline
   - Add backend tests

---

## User Documentation

Users see a simple upload interface with:

**Supported formats: CSV, Excel (.xls, .xlsx)**

Behind the scenes, the system:

1. Detects file type by extension
2. Normalizes to CSV if needed (Excel → CSV conversion)
3. Validates and parses CSV
4. Maps to internal transaction schema
5. Stores in database
6. Updates charts and suggestions

This architecture allows seamless addition of new formats without disrupting the core ingest pipeline.
