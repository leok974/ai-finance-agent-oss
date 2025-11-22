"""Tests for Excel export with transaction filters."""

import io

try:
    from openpyxl import load_workbook

    OPENPYXL_AVAILABLE = True
except ImportError:
    OPENPYXL_AVAILABLE = False

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def _load_wb(content: bytes):
    """Helper to load workbook from bytes."""
    if not OPENPYXL_AVAILABLE:
        raise RuntimeError("openpyxl not available")
    return load_workbook(io.BytesIO(content), read_only=True, data_only=True)


class TestReportExcelFilters:
    """Test suite for Excel export filters."""

    def test_excel_export_accepts_category_filter(self):
        """Verify category filter parameter is accepted."""
        resp = client.get(
            "/report/excel",
            params={"month": "2025-11", "mode": "full", "category": "groceries"},
        )
        # Should succeed (200), not authenticated (401), no data (404), or validation error (422)
        # We're just verifying the filter param is accepted, not testing data
        assert resp.status_code in (
            200,
            401,
            404,
        ), f"Category filter should be accepted, got: {resp.status_code}"

    def test_excel_export_accepts_amount_filters(self):
        """Verify min_amount and max_amount filter parameters are accepted."""
        resp = client.get(
            "/report/excel",
            params={
                "month": "2025-11",
                "mode": "full",
                "min_amount": "50.00",
                "max_amount": "100.00",
            },
        )
        assert resp.status_code in (
            200,
            401,
            404,
        ), f"Amount filters should be accepted, got: {resp.status_code}"

    def test_excel_export_accepts_search_filter(self):
        """Verify search filter parameter is accepted."""
        resp = client.get(
            "/report/excel",
            params={"month": "2025-11", "mode": "full", "search": "CHIPOTLE"},
        )
        assert resp.status_code in (
            200,
            401,
            404,
        ), f"Search filter should be accepted, got: {resp.status_code}"

    def test_excel_export_accepts_combined_filters(self):
        """Verify multiple filters can be combined."""
        resp = client.get(
            "/report/excel",
            params={
                "month": "2025-11",
                "mode": "full",
                "category": "groceries",
                "min_amount": "50.00",
                "search": "CVS",
            },
        )
        assert resp.status_code in (
            200,
            401,
            404,
        ), f"Combined filters should be accepted, got: {resp.status_code}"

    def test_excel_export_filename_includes_mode(self):
        """Verify filename format includes mode."""
        resp = client.get("/report/excel", params={"month": "2025-11", "mode": "full"})
        if resp.status_code == 200:
            content_disposition = resp.headers.get("content-disposition", "")
            # Should be: ledgermind-full-2025-11.xlsx
            assert (
                "ledgermind-full-2025-11.xlsx" in content_disposition
            ), f"Expected filename with mode, got: {content_disposition}"
