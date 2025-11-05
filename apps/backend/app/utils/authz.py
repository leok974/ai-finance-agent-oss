"""Authorization helpers for role-based access control."""

from fastapi import Depends, HTTPException
from app.utils.auth import get_current_user
from app.orm_models import User


def require_admin(user: User = Depends(get_current_user)) -> User:
    """Ensure the current user has the 'admin' role.

    Raises:
        HTTPException: 403 if user does not have admin role

    Returns:
        User: The authenticated user with admin role
    """
    # Extract role names from user.roles (UserRole relationships)
    user_roles = {ur.role.name for ur in (user.roles or [])}

    if "admin" not in user_roles:
        raise HTTPException(status_code=403, detail="admin only")

    return user
