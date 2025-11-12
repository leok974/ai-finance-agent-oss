"""Prometheus metrics for agent chat endpoints."""

from prometheus_client import Counter, Histogram

# Request counter with auth result and test mode labels
agent_requests_total = Counter(
    "agent_chat_requests_total",
    "Total agent chat requests by auth result and mode",
    ["auth", "mode"],  # auth: ok|fail|bypass, mode: stub|echo|real|hermetic
)

# Replay protection triggers
agent_replay_attempts_total = Counter(
    "agent_chat_replay_attempts_total",
    "Duplicate timestamp replay protection triggers",
)

# Clock skew distribution
agent_auth_skew_ms = Histogram(
    "agent_auth_skew_milliseconds",
    "Clock skew between client timestamp and server time",
    buckets=[0, 100, 500, 1000, 5000, 10000, 30000, 60000, 300000],
)
