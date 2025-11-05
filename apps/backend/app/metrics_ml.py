"""Prometheus metrics for ML pipeline.

Tracks training runs, model performance, prediction latency, and shadow mode comparisons.
"""
from prometheus_client import Counter, Gauge, Histogram, REGISTRY

# Training metrics
ml_train_runs_total = Counter(
    "lm_ml_train_runs_total",
    "Number of ML training runs",
    ["status"],  # started, finished, no_data
    registry=REGISTRY
)

ml_train_val_f1_macro = Gauge(
    "lm_ml_train_val_f1_macro",
    "Validation F1 macro of last training run",
    registry=REGISTRY
)

# Prediction metrics
ml_predict_requests_total = Counter(
    "lm_ml_predict_requests_total",
    "ML predict requests",
    ["available"],  # True/False
    registry=REGISTRY
)

ml_predict_latency_seconds = Histogram(
    "lm_ml_predict_latency_seconds",
    "Latency for ML prediction (seconds)",
    buckets=[.01, .02, .05, .1, .2, .5, 1, 2],
    registry=REGISTRY
)

# Shadow mode comparison
suggest_compare_total = Counter(
    "lm_suggest_compare_total",
    "Rule vs model comparison in shadow mode",
    ["agree"],  # True/False/None (if model unavailable)
    registry=REGISTRY
)

# Canary deployment tracking
suggest_source_total = Counter(
    "lm_suggest_source_total",
    "Suggestions by source (rule vs model)",
    ["source"],  # rule, model
    registry=REGISTRY
)

# New: Model predictions acceptance
lm_ml_predictions_total = Counter(
    "lm_ml_predictions_total",
    "Model predictions outcome",
    ["accepted"],  # "True"/"False"
    registry=REGISTRY
)

# New: Fallback reasons
lm_ml_fallback_total = Counter(
    "lm_ml_fallback_total",
    "Fallback reasons when model not used",
    ["reason"],
    registry=REGISTRY
)

# New: Prediction latency histogram (alias for ml_predict_latency_seconds)
lm_ml_predict_latency_seconds = ml_predict_latency_seconds

# New: Compare total (alias for suggest_compare_total)
lm_suggest_compare_total = suggest_compare_total

# Prime all metrics with zero values
ml_train_runs_total.labels(status="started").inc(0)
ml_train_runs_total.labels(status="finished").inc(0)
ml_train_runs_total.labels(status="no_data").inc(0)

ml_predict_requests_total.labels(available="True").inc(0)
ml_predict_requests_total.labels(available="False").inc(0)

suggest_compare_total.labels(agree="True").inc(0)
suggest_compare_total.labels(agree="False").inc(0)
suggest_compare_total.labels(agree="None").inc(0)

suggest_source_total.labels(source="rule").inc(0)
suggest_source_total.labels(source="model").inc(0)

lm_ml_predictions_total.labels(accepted="True").inc(0)
lm_ml_predictions_total.labels(accepted="False").inc(0)

lm_ml_fallback_total.labels(reason="unavailable").inc(0)
lm_ml_fallback_total.labels(reason="not_in_canary").inc(0)
lm_ml_fallback_total.labels(reason="low_confidence").inc(0)
lm_ml_fallback_total.labels(reason="unknown").inc(0)

# Help/describe requests
lm_help_requests_total = Counter(
    "lm_help_requests_total",
    "Help/describe panel lookups",
    ["panel_id", "cache"],  # cache = hit/miss
    registry=REGISTRY
)

# RAG-enhanced help metrics
lm_help_rag_total = Counter(
    "lm_help_rag_total",
    "RAG explain attempts",
    ["status"],  # hit, miss, err, llm_fallback, heuristic
    registry=REGISTRY
)

lm_help_rag_latency_seconds = Histogram(
    "lm_help_rag_latency_seconds",
    "RAG explain latency seconds",
    buckets=[.01, .05, .1, .2, .5, 1, 2, 5],
    registry=REGISTRY
)

# Help cache observability
lm_help_cache_keys = Gauge(
    "lm_help_cache_keys",
    "Number of help:* keys in cache",
    registry=REGISTRY
)

# Prime help/RAG metrics
lm_help_rag_total.labels(status="hit").inc(0)
lm_help_rag_total.labels(status="miss").inc(0)
lm_help_rag_total.labels(status="err").inc(0)
lm_help_rag_total.labels(status="llm_fallback").inc(0)
lm_help_rag_total.labels(status="heuristic").inc(0)

