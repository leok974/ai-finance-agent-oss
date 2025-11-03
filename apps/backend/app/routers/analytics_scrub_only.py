"""Isolated exports of analytics scrub utilities for unit testing without
importing the full analytics_receiver (which registers Prometheus metrics)."""

from __future__ import annotations
from .analytics_receiver import _scrub_props  # re-export

__all__ = ["_scrub_props"]
