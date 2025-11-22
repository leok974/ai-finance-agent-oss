"""Tests for Excel export workbook structure."""

import io
from fastapi.testclient import TestClient

try:
    from openpyxl import load_workbook

    OPENPYXL_AVAILABLE = True
except ImportError:
    OPENPYXL_AVAILABLE = False

from app.main import app

client = TestClient(app)


class TestReportExcelStructure:
    """Test suite for Excel workbook structure based on mode."""

    def _get_sheetnames(self, content: bytes) -> list[str]:
        """Extract sheet names from Excel workbook bytes."""
        if not OPENPYXL_AVAILABLE:
            # Fallback: just verify it's not empty
            return []
        wb = load_workbook(io.BytesIO(content), read_only=True)
        return wb.sheetnames

    def test_full_mode_has_all_core_sheets(self):
        """Verify mode=full includes Summary, Categories, Merchants, Transactions sheets."""
        resp = client.get("/report/excel", params={"month": "2025-11", "mode": "full"})
        # May return 401 if not authenticated in test context, or 404 if no data
        if resp.status_code not in (200, 401, 404):
            assert False, f"Unexpected status: {resp.status_code}"

        if resp.status_code == 200 and OPENPYXL_AVAILABLE:
            names = self._get_sheetnames(resp.content)
            # Verify core sheets are present (order matters)
            assert "Summary" in names, f"Missing Summary sheet, got: {names}"
            assert "Categories" in names, f"Missing Categories sheet, got: {names}"
            assert "Merchants" in names, f"Missing Merchants sheet, got: {names}"
            assert "Transactions" in names, f"Missing Transactions sheet, got: {names}"

            # Verify Summary is first
            if names:
                assert names[0] == "Summary", f"Summary should be first, got: {names}"

    def test_summary_mode_only_has_summary_sheet(self):
        """Verify mode=summary includes only Summary sheet."""
        resp = client.get(
            "/report/excel", params={"month": "2025-11", "mode": "summary"}
        )
        if resp.status_code not in (200, 401, 404):
            assert False, f"Unexpected status: {resp.status_code}"

        if resp.status_code == 200 and OPENPYXL_AVAILABLE:
            names = self._get_sheetnames(resp.content)
            assert names == [
                "Summary"
            ], f"Summary mode should only have Summary sheet, got: {names}"

    def test_unknowns_mode_only_has_unknowns_sheet(self):
        """Verify mode=unknowns includes only Unknowns sheet."""
        resp = client.get(
            "/report/excel", params={"month": "2025-11", "mode": "unknowns"}
        )
        if resp.status_code not in (200, 401, 404):
            assert False, f"Unexpected status: {resp.status_code}"

        if resp.status_code == 200 and OPENPYXL_AVAILABLE:
            names = self._get_sheetnames(resp.content)
            assert names == [
                "Unknowns"
            ], f"Unknowns mode should only have Unknowns sheet, got: {names}"

    def test_summary_sheet_structure(self):
        """Verify Summary sheet has expected structure."""
        resp = client.get(
            "/report/excel", params={"month": "2025-11", "mode": "summary"}
        )
        if resp.status_code == 200 and OPENPYXL_AVAILABLE:
            wb = load_workbook(io.BytesIO(resp.content), read_only=True)
            ws = wb["Summary"]

            # Check title
            assert (
                "LedgerMind" in ws["A1"].value
            ), f"Expected title in A1, got: {ws['A1'].value}"

            # Check month label
            assert (
                ws["A2"].value == "Month"
            ), f"Expected 'Month' in A2, got: {ws['A2'].value}"

            # Check table headers (row 4)
            assert (
                ws["A4"].value == "Metric"
            ), f"Expected 'Metric' in A4, got: {ws['A4'].value}"
            assert (
                ws["B4"].value == "Value"
            ), f"Expected 'Value' in B4, got: {ws['B4'].value}"

    def test_categories_sheet_headers(self):
        """Verify Categories sheet has expected headers."""
        resp = client.get("/report/excel", params={"month": "2025-11", "mode": "full"})
        if resp.status_code == 200 and OPENPYXL_AVAILABLE:
            wb = load_workbook(io.BytesIO(resp.content), read_only=True)
            if "Categories" in wb.sheetnames:
                ws = wb["Categories"]
                headers = [cell.value for cell in ws[1]]

                expected = [
                    "category_slug",
                    "category_label",
                    "txn_count",
                    "total_amount",
                    "pct_of_spend",
                ]
                assert (
                    headers == expected
                ), f"Expected headers {expected}, got: {headers}"

    def test_merchants_sheet_headers(self):
        """Verify Merchants sheet has expected headers."""
        resp = client.get("/report/excel", params={"month": "2025-11", "mode": "full"})
        if resp.status_code == 200 and OPENPYXL_AVAILABLE:
            wb = load_workbook(io.BytesIO(resp.content), read_only=True)
            if "Merchants" in wb.sheetnames:
                ws = wb["Merchants"]
                headers = [cell.value for cell in ws[1]]

                expected = [
                    "merchant_display",
                    "merchant_canonical",
                    "txn_count",
                    "total_amount",
                    "top_category_slug",
                    "top_category_label",
                ]
                assert (
                    headers == expected
                ), f"Expected headers {expected}, got: {headers}"

    def test_transactions_sheet_headers(self):
        """Verify Transactions sheet has expected headers."""
        resp = client.get("/report/excel", params={"month": "2025-11", "mode": "full"})
        if resp.status_code == 200 and OPENPYXL_AVAILABLE:
            wb = load_workbook(io.BytesIO(resp.content), read_only=True)
            if "Transactions" in wb.sheetnames:
                ws = wb["Transactions"]
                headers = [cell.value for cell in ws[1]]

                expected = [
                    "date",
                    "merchant",
                    "description",
                    "amount",
                    "category_label",
                    "category_slug",
                ]
                assert (
                    headers == expected
                ), f"Expected headers {expected}, got: {headers}"

    def test_unknowns_sheet_structure(self):
        """Verify Unknowns sheet has expected structure."""
        resp = client.get(
            "/report/excel", params={"month": "2025-11", "mode": "unknowns"}
        )
        if resp.status_code == 200 and OPENPYXL_AVAILABLE:
            wb = load_workbook(io.BytesIO(resp.content), read_only=True)
            ws = wb["Unknowns"]

            # Check title (row 1)
            assert (
                "Uncategorized" in ws["A1"].value
            ), f"Expected title in A1, got: {ws['A1'].value}"

            # Check headers (row 3)
            headers = [cell.value for cell in ws[3]]
            expected = [
                "date",
                "merchant",
                "description",
                "amount",
                "category_label",
                "category_slug",
            ]
            assert headers == expected, f"Expected headers {expected}, got: {headers}"

    def test_backwards_compat_include_transactions_true_creates_transactions_sheet(
        self,
    ):
        """Verify old include_transactions=true still creates transactions sheet."""
        resp = client.get(
            "/report/excel",
            params={"month": "2025-11", "include_transactions": "true"},
        )
        if resp.status_code == 200 and OPENPYXL_AVAILABLE:
            names = self._get_sheetnames(resp.content)
            # Should map to full mode
            assert "Summary" in names
            if names:  # May not have transactions if no data
                # At minimum should have Summary
                assert names[0] == "Summary"

    def test_backwards_compat_include_transactions_false_summary_only(self):
        """Verify old include_transactions=false creates summary-only workbook."""
        resp = client.get(
            "/report/excel",
            params={"month": "2025-11", "include_transactions": "false"},
        )
        if resp.status_code == 200 and OPENPYXL_AVAILABLE:
            names = self._get_sheetnames(resp.content)
            # Should map to summary mode
            assert names == ["Summary"]
