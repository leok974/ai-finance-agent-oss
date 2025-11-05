"""
App package bootstrap.

Provides shims so legacy imports like `app.models.transaction` work while
keeping `app/models.py` as a simple module (not a package).
"""

from __future__ import annotations

import sys
import types

# Re-export common ORM models via synthetic submodules under app.models.*
try:
    from .orm_models import Transaction, Feedback, Rule as RuleORM

    try:
        from .orm_models import RuleSuggestion
    except Exception:
        RuleSuggestion = None  # type: ignore

    # app.models.transaction
    mod_txn = types.ModuleType("app.models.transaction")
    mod_txn.Transaction = Transaction  # type: ignore[attr-defined]
    sys.modules.setdefault("app.models.transaction", mod_txn)

    # app.models.feedback
    mod_fb = types.ModuleType("app.models.feedback")
    mod_fb.Feedback = Feedback  # type: ignore[attr-defined]
    sys.modules.setdefault("app.models.feedback", mod_fb)

    # app.models.rule_suggestion (optional)
    if RuleSuggestion is not None:
        mod_rs = types.ModuleType("app.models.rule_suggestion")
        mod_rs.RuleSuggestion = RuleSuggestion  # type: ignore[attr-defined]
        sys.modules.setdefault("app.models.rule_suggestion", mod_rs)
except Exception:
    # Non-fatal in environments where ORM isn't available yet
    pass
