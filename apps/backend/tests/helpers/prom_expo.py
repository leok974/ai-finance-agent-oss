"""Tiny Prometheus exposition parser helpers for tests.

Features:
- Skips metadata lines (# HELP / # TYPE)
- Parses labeled and unlabeled samples
- Parses numeric values as float (1, 1.0, 1e0)
- Count unlabeled vs. labeled samples and fetch a sample value

Intended for lightweight assertions; not a full parser.
"""

from __future__ import annotations
import re
from typing import Dict, Iterator, Optional, Tuple

_SAMPLE_RE = re.compile(
    r"""^(?P<name>[a-zA-Z_:][a-zA-Z0-9_:]*)\s*
        (?:\{(?P<labels>[^}]*)\})?    # optional {k="v",...}
        \s+(?P<value>[-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)
        (?:\s+\d+)?\s*$               # optional timestamp
    """,
    re.VERBOSE,
)

_LABEL_RE = re.compile(
    r"""\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*"((?:\\.|[^"\\])*)"\s*(?:,|$)"""
)


def _parse_labels(s: str) -> Dict[str, str]:
    labels: Dict[str, str] = {}
    i = 0
    while i < len(s):
        m = _LABEL_RE.match(s, i)
        if not m:
            break
        key = m.group(1)
        val = m.group(2).encode("utf-8").decode("unicode_escape")
        labels[key] = val
        i = m.end()
    return labels


def iter_samples(text: str, metric: str) -> Iterator[Tuple[Dict[str, str], float]]:
    for line in text.splitlines():
        if not line or line.startswith("#"):
            continue
        m = _SAMPLE_RE.match(line)
        if not m:
            continue
        if m.group("name") != metric:
            continue
        labels_raw = m.group("labels")
        labels = _parse_labels(labels_raw) if labels_raw else {}
        value = float(m.group("value"))
        yield labels, value


def count_unlabeled(text: str, metric: str) -> int:
    return sum(1 for labels, _ in iter_samples(text, metric) if not labels)


def count_labeled(text: str, metric: str, **must_match: str) -> int:
    n = 0
    for labels, _ in iter_samples(text, metric):
        if all(labels.get(k) == v for k, v in must_match.items()):
            n += 1
    return n


def value_for(text: str, metric: str, **labels_match: str) -> Optional[float]:
    for labels, v in iter_samples(text, metric):
        if all(labels.get(k) == v_ for k, v_ in labels_match.items()):
            return v
    return None


# ---------- Histogram helpers ----------
def histogram_bucket(
    text: str, metric_base: str, le: str, **extra: str
) -> Optional[float]:
    """Return the cumulative count for <metric_base>_bucket{le="..."} if present."""
    return value_for(text, f"{metric_base}_bucket", le=le, **extra)


def histogram_sum(text: str, metric_base: str, **extra: str) -> Optional[float]:
    return value_for(text, f"{metric_base}_sum", **extra)


def histogram_count(text: str, metric_base: str, **extra: str) -> Optional[float]:
    return value_for(text, f"{metric_base}_count", **extra)


# ---------- Summary helpers ----------
def summary_quantile(
    text: str, metric_base: str, quantile: str, **extra: str
) -> Optional[float]:
    return value_for(text, metric_base, quantile=quantile, **extra)
