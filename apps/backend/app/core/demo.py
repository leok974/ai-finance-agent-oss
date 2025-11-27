"""
Demo mode utilities for resolving user context based on demo flag.

Centralizes the logic for switching between real user data and demo user data.
"""

from app.config import DEMO_USER_ID


def resolve_user_for_mode(current_user_id: int, demo: bool) -> tuple[int, bool]:
    """
    Resolve the effective user_id and include_demo flag based on demo mode.

    Args:
        current_user_id: The authenticated user's ID
        demo: Whether to use demo mode (show demo user's data)

    Returns:
        tuple of (user_id, include_demo):
            - user_id: DEMO_USER_ID if demo=True, else current_user_id
            - include_demo: True if demo mode, False otherwise

    Example:
        user_id, include_demo = resolve_user_for_mode(current_user_id, demo=request.query.demo)
        month_agg = load_month(db, user_id=user_id, month=month, include_demo=include_demo)
    """
    if demo:
        return DEMO_USER_ID, True
    return current_user_id, False
