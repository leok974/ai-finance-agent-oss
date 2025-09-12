from __future__ import annotations
import json
from pathlib import Path
from typing import Any, Dict, List, Set, Tuple
from datetime import date

STORE_DIR = Path(__file__).resolve().parent.parent / "data" / "store"
STORE_DIR.mkdir(parents=True, exist_ok=True)
TXNS_PATH = STORE_DIR / "txns.json"
LABELS_PATH = STORE_DIR / "user_labels.json"
RULES_PATH = STORE_DIR / "rules.json"

def _read_json(path: Path, default):
    try:
        if path.exists():
            with path.open("r", encoding="utf-8") as f:
                return json.load(f)
    except Exception:
        pass
    return default

def _write_json(path: Path, data) -> None:
    tmp = path.with_suffix(".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    tmp.replace(path)

def load_state(app) -> None:
    """Load txns/rules/labels into app.state if present on disk."""
    app.state.txns = _read_json(TXNS_PATH, [])
    app.state.user_labels = _read_json(LABELS_PATH, [])
    app.state.rules = _read_json(RULES_PATH, [])

def save_state(app) -> None:
    """Persist txns/rules/labels from app.state to disk."""
    _write_json(TXNS_PATH, getattr(app.state, "txns", []))
    _write_json(LABELS_PATH, getattr(app.state, "user_labels", []))
    _write_json(RULES_PATH, getattr(app.state, "rules", []))

# ---------------------------------------------------------------------------
# Ephemeral overlays/state used by certain endpoints and agent flows
# ---------------------------------------------------------------------------

# Temp budgets are scoped to a month key "YYYY-MM" to avoid stale carryover.
# Map: (month_key, category) -> amount
TEMP_BUDGETS: Dict[Tuple[str, str], float] = {}

# Categories to ignore for anomaly surfacing (global until cleared)
ANOMALY_IGNORES: Set[str] = set()

def current_month_key(today: date | None = None) -> str:
    d = today or date.today()
    return f"{d.year:04d}-{d.month:02d}"

# ---------------------------------------------------------------------------
# Persisted Rule Suggestions (in-memory stub)
# ---------------------------------------------------------------------------
from typing import Dict, Literal
from datetime import datetime  # noqa: F401  # used by routers for timestamps

SuggestionStatus = Literal["new", "accepted", "dismissed"]

# Simple in-memory store keyed by autoincrement id
PERSISTED_SUGGESTIONS: Dict[int, dict] = {}
PERSISTED_SUGGESTIONS_SEQ: int = 1  # simple autoincrement

def _sugg_key(merchant: str, category: str) -> str:
    return f"{merchant}||{category}".lower()

# index to de-dupe by (merchant,category)
PERSISTED_SUGGESTIONS_IDX: Dict[str, int] = {}

def persisted_suggestions_reset():
    global PERSISTED_SUGGESTIONS, PERSISTED_SUGGESTIONS_SEQ, PERSISTED_SUGGESTIONS_IDX
    PERSISTED_SUGGESTIONS = {}
    PERSISTED_SUGGESTIONS_SEQ = 1
    PERSISTED_SUGGESTIONS_IDX = {}
