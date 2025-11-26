"""Demo login endpoint - quick access with pre-seeded data."""

import logging
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.orm_models import User
from app.utils.auth import create_tokens, set_auth_cookies, get_current_user

logger = logging.getLogger("auth.demo")
router = APIRouter(tags=["auth"])


@router.post("/auth/demo")
async def auth_demo_login(db: Session = Depends(get_db)):
    """
    Demo login endpoint.

    Creates/retrieves demo user and issues session tokens.
    No password required - demo account is public.
    """
    if not settings.DEMO_ENABLED:
        raise HTTPException(status_code=403, detail="Demo login is disabled")

    # Get or create demo user
    user = db.query(User).filter(User.email == settings.DEMO_USER_EMAIL).first()

    is_new_demo_user = user is None
    if not user:
        # Create demo user if it doesn't exist
        user = User(
            email=settings.DEMO_USER_EMAIL,
            name=settings.DEMO_USER_NAME,
            is_demo=True,
            is_active=True,
            password_hash="",  # No password for demo
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        logger.info(f"Created demo user: {user.email}")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Demo account is disabled")

    # Auto-seed demo data for new demo users
    if is_new_demo_user:
        try:
            from app.routers.demo_seed import seed_demo_data_for_user

            seed_demo_data_for_user(user.id, db)
            logger.info(f"Auto-seeded demo data for demo user {user.id}")
        except Exception as e:
            # Log but don't fail login if demo seed fails
            logger.warning(
                f"Failed to auto-seed demo data for demo user {user.id}: {e}"
            )

    # Extract user roles for token generation
    roles = [ur.role.name for ur in user.roles] if user.roles else []

    # Create session tokens
    tokens = create_tokens(user.email, roles)

    # Build response
    response = JSONResponse(
        content={
            "ok": True,
            "user": {
                "id": user.id,
                "email": user.email,
                "name": user.name,
                "is_demo": True,
            },
            "access_token": tokens.access_token,
            "refresh_token": tokens.refresh_token,
        }
    )

    # Set auth cookies
    set_auth_cookies(response, tokens)

    logger.info(f"Demo login successful for {user.email}")
    return response


@router.post("/demo/bootstrap")
async def demo_bootstrap(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Bootstrap demo account with transaction data.

    Idempotent - only seeds data if user has no existing transactions.
    Returns whether data was created.
    """
    from app.scripts.seed_demo_data import seed_demo_data_for_user

    created = seed_demo_data_for_user(db, user_id=current_user.id)

    return {
        "created": created,
        "message": "Demo data seeded" if created else "User already has transactions",
    }
