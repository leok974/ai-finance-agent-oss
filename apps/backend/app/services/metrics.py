"""Prometheus metrics for suggestion system."""

from prometheus_client import Counter, Histogram

SUGGESTIONS_TOTAL = Counter(
    "lm_suggestions_total",
    "Number of suggestions generated",
    ["mode", "source"],  # mode=heuristic|model|auto; source=shadow|canary|live
)

SUGGESTIONS_COVERED = Counter(
    "lm_suggestions_covered_total",
    "Number of txns that received >=1 suggestion",
)

SUGGESTIONS_ACCEPT = Counter(
    "lm_suggestions_accept_total",
    "Accepted suggestions",
    ["label"],
)

SUGGESTIONS_REJECT = Counter(
    "lm_suggestions_reject_total",
    "Rejected suggestions",
    ["label"],
)

SUGGESTIONS_LATENCY = Histogram(
    "lm_suggestions_latency_ms",
    "Latency of suggest endpoint (ms)",
    buckets=(25, 50, 100, 200, 400, 800, 1600, 3200),
)

HTTP_ERRORS = Counter(
    "lm_http_errors_total",
    "HTTP 5xx errors by route",
    ["route"],
)

# Ingest endpoint metrics for monitoring and SLO alerts
INGEST_REQUESTS = Counter(
    "lm_ingest_requests_total",
    "Total ingest requests by phase",
    ["phase"],  # phase=replace|append
)

INGEST_ERRORS = Counter(
    "lm_ingest_errors_total",
    "Ingest endpoint errors by phase",
    ["phase"],  # phase=replace|append
)

# Prime metrics so they appear immediately in /metrics
INGEST_REQUESTS.labels(phase="replace").inc(0)
INGEST_REQUESTS.labels(phase="append").inc(0)
INGEST_ERRORS.labels(phase="replace").inc(0)
INGEST_ERRORS.labels(phase="append").inc(0)
