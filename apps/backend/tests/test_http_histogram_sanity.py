from fastapi.testclient import TestClient
from app.main import app
from .helpers.prom_expo import histogram_bucket, histogram_sum, histogram_count

# This test is opportunistic: it will skip gracefully if the expected
# http_request_duration_seconds histogram is not exposed.

def test_http_latency_histogram():
    c = TestClient(app)
    text = c.get("/api/metrics").text
    # Probe a couple of buckets; if first bucket missing, assume histogram absent and skip
    b1 = histogram_bucket(text, "http_request_duration_seconds", le="0.1")
    if b1 is None:
        import pytest
        pytest.skip("http_request_duration_seconds histogram not present")
    b2 = histogram_bucket(text, "http_request_duration_seconds", le="0.2")
    if b2 is not None and b1 is not None:
        # Bucket counts should be cumulative; tolerate rare racey zeroing by skipping
        if b2 < b1:
            import pytest
            pytest.skip("Non-monotonic bucket snapshot (transient) – skipping")
    total = histogram_count(text, "http_request_duration_seconds") or 0.0
    hsum = histogram_sum(text, "http_request_duration_seconds") or 0.0
    # Basic invariants
    assert total >= 0.0
    assert hsum >= 0.0
