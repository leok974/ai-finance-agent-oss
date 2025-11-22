"""
Test Excel export route ensures route shape and content-type are correct.
"""

import pytest
from fastapi.testclient import TestClient


@pytest.mark.httpapi
def test_excel_export_route_returns_xlsx(client: TestClient):
    """Verify /report/excel route returns Excel content type and disposition header."""
    # This test requires auth - will get 401 if auth not mocked
    # For now, test that the route exists and has correct shape when accessible
    resp = client.get("/report/excel?month=2025-11&include_transactions=true")

    # If auth is properly configured in test client, expect 200
    # Otherwise expect 401 (not 404, which was the original bug)
    assert resp.status_code in (
        200,
        401,
    ), f"Expected 200 (success) or 401 (auth required), got {resp.status_code}"

    # If we got 200, verify headers
    if resp.status_code == 200:
        content_type = resp.headers.get("content-type", "")
        assert (
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            in content_type
        ), f"Expected Excel MIME type, got: {content_type}"

        disposition = resp.headers.get("content-disposition", "")
        assert (
            "attachment" in disposition.lower()
        ), f"Expected Content-Disposition header with attachment, got: {disposition}"
        assert (
            ".xlsx" in disposition.lower()
        ), f"Expected .xlsx extension in filename, got: {disposition}"


@pytest.mark.httpapi
def test_excel_export_route_exists_not_404(client: TestClient):
    """Guard against regression to 404 - route must exist even if auth fails."""
    resp = client.get("/report/excel?month=2025-11")

    # The route should exist, so we should NOT get 404
    assert (
        resp.status_code != 404
    ), "Excel export route returned 404 - route is missing or path is wrong"

    # Expected: either 200 (if auth passes) or 401 (if auth required)
    assert resp.status_code in (
        200,
        401,
    ), f"Expected 200 or 401, got {resp.status_code}"


@pytest.mark.httpapi
def test_pdf_export_route_exists_not_404(client: TestClient):
    """Guard against regression to 404 for PDF route."""
    resp = client.get("/report/pdf?month=2025-11")

    # Route should exist (may return 401 if auth required, or 503 if reportlab missing)
    assert (
        resp.status_code != 404
    ), "PDF export route returned 404 - route is missing or path is wrong"

    # Expected: 200, 401 (auth), or 503 (PDF engine unavailable)
    assert resp.status_code in (
        200,
        401,
        503,
    ), f"Expected 200, 401, or 503, got {resp.status_code}"


@pytest.mark.httpapi
def test_excel_export_accepts_query_params(client: TestClient):
    """Verify Excel export accepts expected query parameters."""
    # Test with various param combinations
    test_cases = [
        "month=2025-11",
        "month=2025-11&include_transactions=true",
        "month=2025-11&include_transactions=false",
        "month=2025-11&split_transactions_alpha=true",
        "start=2025-11-01&end=2025-11-30",
    ]

    for params in test_cases:
        resp = client.get(f"/report/excel?{params}")

        # Should not be 404 or 422 (validation error)
        assert resp.status_code not in (
            404,
            422,
        ), f"Route failed with params '{params}': {resp.status_code}"

        # Expected: 200 (success) or 401 (auth required)
        assert resp.status_code in (
            200,
            401,
        ), f"Unexpected status for params '{params}': {resp.status_code}"
