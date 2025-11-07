"""Auth guard dependency for protecting routes with user data isolation."""

from fastapi import Depends, HTTPException
from app.utils.auth import get_current_user as _get_current_user_base
from app.orm_models import User


def get_current_user_id(user: User = Depends(_get_current_user_base)) -> int:
    """
    Extract user ID from authenticated user.

    This is the PRIMARY dependency for enforcing user data isolation.
    Use this in all routes that access user-specific data (transactions, charts, etc.)

    Usage:
        @router.get("/transactions")
        def list_transactions(
            user_id: int = Depends(get_current_user_id),
            db: Session = Depends(get_db)
        ):
            return db.query(Transaction).filter(Transaction.user_id == user_id).all()

    Returns:
        int: User's database ID

    Raises:
        HTTPException: 401 if user not authenticated
    """
    if not user or not user.id:
        raise HTTPException(401, "User not authenticated")
    return user.id
