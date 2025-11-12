"""Authentication override utilities for hermetic testing.

Provides dependency override helpers to inject authenticated users without
requiring real auth flow (cookies, JWT, sessions). Faster and more reliable
for unit/integration tests.
"""

from contextlib import ExitStack
from types import SimpleNamespace

from fastapi import FastAPI


# Use actual User model if available; fallback to SimpleNamespace
try:
    from app.orm_models import User, Role, UserRole
except ImportError:

    class User(SimpleNamespace):
        """Minimal user model for testing."""

        id: int
        email: str
        roles: list


# Import the actual dependency that routes use
from app.utils.auth import get_current_user


class AuthOverride:
    """Manages dependency overrides for authentication in tests.

    Usage:
        with AuthOverride(app) as auth:
            auth.use(is_admin=False)
            response = client.get("/protected/route")
            assert response.status_code == 403  # authenticated but not admin
    """

    def __init__(self, app: FastAPI):
        self.app = app
        self._stack = ExitStack()

    def use(
        self, *, is_admin: bool, user_id: int = 123, email: str = "test@example.com"
    ) -> User:
        """Override auth to return a user with specified attributes.

        Args:
            is_admin: Whether user has admin privileges
            user_id: User ID (default: 123)
            email: User email (default: test@example.com)

        Returns:
            The User instance that will be injected
        """
        # Create user without is_admin parameter (doesn't exist in ORM model)
        user = User(id=user_id, email=email, password_hash="test_hash")

        # Set up role relationships
        if is_admin:
            admin_role = Role(id=1, name="admin")
            user_role_obj = UserRole(user_id=user_id, role_id=1)
            user_role_obj.role = admin_role
            user.roles = [user_role_obj]
        else:
            # Non-admin user (no roles)
            user.roles = []

        def _dep() -> User:
            return user

        self.app.dependency_overrides[get_current_user] = _dep
        return user

    def reset(self) -> None:
        """Remove the auth override, restoring normal behavior."""
        self.app.dependency_overrides.pop(get_current_user, None)

    def __enter__(self) -> "AuthOverride":
        return self

    def __exit__(self, *exc) -> None:
        self.reset()


def override_user(app: FastAPI, *, is_admin: bool) -> AuthOverride:
    """Convenience function to create and activate an auth override.

    Args:
        app: FastAPI application instance
        is_admin: Whether user should have admin privileges

    Returns:
        AuthOverride context manager (auto-activates override)
    """
    mgr = AuthOverride(app)
    mgr.use(is_admin=is_admin)
    return mgr
