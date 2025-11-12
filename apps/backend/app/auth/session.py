"""
Session management utilities for E2E testing.
"""

from app.utils.auth import create_tokens, Tokens


def issue_session_for_user(
    email: str,
    reason: str = "e2e-test",
    max_age: int = 3600,
) -> Tokens:
    """
    Issue access and refresh tokens for a given user email.

    Args:
        email: User email address
        reason: Reason for session creation (for audit)
        max_age: Token TTL in seconds (default: 1 hour)

    Returns:
        Tokens pair (access_token, refresh_token)

    Note:
        This creates tokens without verifying the user exists.
        For E2E tests, the user should be pre-created in the database
        with appropriate roles.
    """
    # For E2E, assume user has basic "user" role
    # In production, you'd fetch actual roles from DB
    roles = ["user"]

    return create_tokens(email, roles)
