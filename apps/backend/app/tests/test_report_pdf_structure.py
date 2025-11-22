"""Tests for PDF export structure and content."""

import io
from fastapi.testclient import TestClient

try:
    from PyPDF2 import PdfReader

    PYPDF2_AVAILABLE = True
except ImportError:
    PYPDF2_AVAILABLE = False

from app.main import app

client = TestClient(app)


class TestReportPdfStructure:
    """Test suite for PDF report structure and content."""

    def test_month_pdf_basic_structure(self):
        """Verify PDF has basic structure with title and month."""
        resp = client.get("/report/pdf", params={"month": "2025-11"})

        # May return 401 (auth), 404 (no data), or 503 (reportlab missing)
        if resp.status_code not in (200, 401, 404, 503):
            assert False, f"Unexpected status: {resp.status_code}"

        if resp.status_code == 200:
            # Verify content type
            assert resp.headers["content-type"].startswith("application/pdf")

            # Verify non-empty
            assert len(resp.content) > 1000, "PDF should be at least 1KB"

            # If PyPDF2 available, verify text content
            if PYPDF2_AVAILABLE:
                reader = PdfReader(io.BytesIO(resp.content))
                # Extract text from first page
                text = "".join(page.extract_text() or "" for page in reader.pages[:1])

                # Verify key content
                assert "LedgerMind" in text, "PDF should contain 'LedgerMind'"
                assert "Monthly Report" in text, "PDF should contain 'Monthly Report'"
                assert "2025-11" in text, "PDF should contain the month '2025-11'"

    def test_pdf_mode_summary_creates_valid_pdf(self):
        """Verify mode=summary creates valid PDF."""
        resp = client.get("/report/pdf", params={"month": "2025-11", "mode": "summary"})

        if resp.status_code == 200:
            assert resp.headers["content-type"].startswith("application/pdf")
            assert len(resp.content) > 500

            if PYPDF2_AVAILABLE:
                reader = PdfReader(io.BytesIO(resp.content))
                assert len(reader.pages) >= 1, "PDF should have at least one page"

    def test_pdf_mode_full_creates_valid_pdf(self):
        """Verify mode=full creates valid PDF."""
        resp = client.get("/report/pdf", params={"month": "2025-11", "mode": "full"})

        if resp.status_code == 200:
            assert resp.headers["content-type"].startswith("application/pdf")
            assert len(resp.content) > 500

            if PYPDF2_AVAILABLE:
                reader = PdfReader(io.BytesIO(resp.content))
                assert len(reader.pages) >= 1, "PDF should have at least one page"

    def test_pdf_contains_summary_metrics(self):
        """Verify PDF contains expected summary metrics."""
        resp = client.get("/report/pdf", params={"month": "2025-11", "mode": "full"})

        if resp.status_code == 200 and PYPDF2_AVAILABLE:
            reader = PdfReader(io.BytesIO(resp.content))
            text = "".join(page.extract_text() or "" for page in reader.pages)

            # Check for key metrics labels
            assert (
                "Total income" in text or "Total Income" in text
            ), "Should contain total income"
            assert (
                "Total spend" in text or "Total Spend" in text
            ), "Should contain total spend"
            assert "Net" in text, "Should contain net"

    def test_pdf_contains_top_sections(self):
        """Verify PDF contains top categories and merchants sections."""
        resp = client.get("/report/pdf", params={"month": "2025-11", "mode": "full"})

        if resp.status_code == 200 and PYPDF2_AVAILABLE:
            reader = PdfReader(io.BytesIO(resp.content))
            text = "".join(page.extract_text() or "" for page in reader.pages)

            # Check for section headers (case-insensitive)
            text_lower = text.lower()
            assert (
                "top categories" in text_lower or "categories" in text_lower
            ), "Should contain categories section"
            assert (
                "top merchants" in text_lower or "merchants" in text_lower
            ), "Should contain merchants section"

    def test_pdf_unknowns_mode_rejected(self):
        """Verify PDF rejects unknowns mode with 400."""
        resp = client.get(
            "/report/pdf", params={"month": "2025-11", "mode": "unknowns"}
        )

        # Should return 400 (bad request) or 401 (auth check happens first)
        assert resp.status_code in (400, 401)

        if resp.status_code == 400:
            # Verify error message mentions unknowns not supported
            assert "unknowns" in resp.json().get("detail", "").lower()
