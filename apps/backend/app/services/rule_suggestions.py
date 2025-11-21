"""
Legacy rule_suggestions module stub.

This module was removed in Phase 1 cleanup (legacy table removal).
Keeping minimal stubs for backward compatibility with existing imports.
"""


def get_config():
    """Legacy stub"""
    return {"enabled": False, "reason": "legacy_removed"}


def mine_suggestions(db, **kwargs):
    """Legacy stub"""
    return []


def accept_suggestion(db, sid):
    """Legacy stub"""
    return None


def dismiss_suggestion(db, sid):
    """Legacy stub"""
    return False


def canonicalize_merchant(merchant):
    """Legacy stub: return merchant as-is"""
    return merchant if merchant else ""


def evaluate_candidate(db, merchant_norm, category):
    """Legacy stub: no suggestion created"""
    return None
