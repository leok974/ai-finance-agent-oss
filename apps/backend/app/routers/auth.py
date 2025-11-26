from fastapi import APIRouter, Depends, HTTPException, status, Response, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session
import os
import secrets
from datetime import datetime, timedelta, timezone

from app.db import get_db
from app.orm_models import User, PasswordResetToken
from app.utils.auth import (
    create_tokens,
    verify_password,
    hash_password,
    get_current_user,
    _ensure_roles,
    set_auth_cookies,
    clear_auth_cookies,
    decode_token,
)
from app.utils.csrf import issue_csrf_cookie, csrf_protect
from sqlalchemy.exc import OperationalError
from app.routers.demo_seed import seed_demo_data_for_user

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginBody(BaseModel):
    email: str
    password: str


class RegisterBody(BaseModel):
    email: str
    password: str
    roles: list[str] = ["user"]


class ChangePasswordBody(BaseModel):
    current_password: str
    new_password: str


class ForgotPasswordBody(BaseModel):
    email: str


class ResetPasswordBody(BaseModel):
    token: str
    new_password: str


@router.post("/login")
def login(body: LoginBody, resp: Response, db: Session = Depends(get_db)):
    try:
        u = db.query(User).filter(User.email == body.email).first()
    except OperationalError as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database unavailable",
        ) from e
    if not u or not verify_password(body.password, u.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials"
        )
    # Load roles
    roles = [ur.role.name for ur in u.roles]
    pair = create_tokens(u.email, roles)
    set_auth_cookies(resp, pair)
    issue_csrf_cookie(resp)
    return pair.model_dump()


@router.post("/register")
def register(body: RegisterBody, resp: Response, db: Session = Depends(get_db)):
    # Check if registration is allowed
    allow_registration = os.getenv("ALLOW_REGISTRATION", "false").lower() in (
        "true",
        "1",
        "yes",
    )
    if not allow_registration:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Registration is currently disabled. Please contact an administrator.",
        )

    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered"
        )
    u = User(email=body.email, password_hash=hash_password(body.password))
    db.add(u)
    db.commit()
    db.refresh(u)
    _ensure_roles(db, u, body.roles)

    # Auto-seed demo data for new users
    try:
        seed_demo_data_for_user(u.id, db)
    except Exception as e:
        # Log but don't fail registration if demo seed fails
        print(f"Warning: Failed to auto-seed demo data for new user {u.id}: {e}")

    roles = body.roles
    pair = create_tokens(u.email, roles)
    set_auth_cookies(resp, pair)
    issue_csrf_cookie(resp)
    return pair.model_dump()


@router.post("/refresh", dependencies=[Depends(csrf_protect)])
def refresh(
    resp: Response,
    request: Request,
    token: str | None = None,
    db: Session = Depends(get_db),
):
    # Accept token either from body or cookie
    tok = token or request.cookies.get("refresh_token")
    try:
        payload = decode_token(tok or "")
        if payload.get("type") != "refresh":
            raise ValueError("Not a refresh token")
        email = payload["sub"]
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Bad refresh token"
        )
    # re-check user status from DB
    u = (
        db.query(User).filter(User.email == email, User.is_active == True).first()
    )  # noqa: E712
    if not u:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="User disabled"
        )
    roles = [ur.role.name for ur in u.roles]
    pair = create_tokens(email, roles)
    set_auth_cookies(resp, pair)
    issue_csrf_cookie(resp)
    return pair.model_dump()


@router.post("/logout", dependencies=[Depends(csrf_protect)])
def logout(request: Request, resp: Response):
    """Logout user and clear all authentication state including dev unlock."""
    # Clear auth cookies
    clear_auth_cookies(resp)

    # Clear dev unlock state (session + cookie)
    resp.delete_cookie("dev_unlocked", path="/", samesite="lax", httponly=True)
    if hasattr(request, "session"):
        request.session.pop("dev_unlocked", None)

    return {"ok": True}


@router.post("/change-password", dependencies=[Depends(csrf_protect)])
def change_password(
    body: ChangePasswordBody,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Change password for authenticated user.

    Requires current password verification. Returns 204 on success.
    """
    # Verify current password
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Current password is incorrect",
        )

    # Validate new password (basic check)
    if len(body.new_password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be at least 6 characters",
        )

    # Update password
    user.password_hash = hash_password(body.new_password)
    db.commit()

    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/forgot-password", dependencies=[Depends(csrf_protect)])
def forgot_password(body: ForgotPasswordBody, db: Session = Depends(get_db)):
    """Request password reset token.

    Always returns 200 to prevent email enumeration.
    In development, logs token to console. In production, would send email.
    """
    # Find user (but don't reveal if exists)
    user = db.query(User).filter(User.email == body.email).first()

    if user:
        # Invalidate any existing tokens for this user
        db.query(PasswordResetToken).filter(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.used == False,  # noqa: E712
        ).update({"used": True})

        # Generate secure token
        token = secrets.token_urlsafe(32)
        expires_at = datetime.now(timezone.utc) + timedelta(hours=1)

        # Store token
        reset_token = PasswordResetToken(
            user_id=user.id, token=token, expires_at=expires_at
        )
        db.add(reset_token)
        db.commit()

        # TODO: Send email with reset link
        # For now, log to console (dev mode only)
        reset_url = f"https://app.ledger-mind.org/reset-password?token={token}"
        print(f"[AUTH] Password reset requested for {body.email}")
        print(f"[AUTH] Reset URL: {reset_url}")
        print(f"[AUTH] Token expires: {expires_at}")

    # Always return success to prevent email enumeration
    return {"message": "If the email exists, a reset link has been sent"}


@router.post("/reset-password", dependencies=[Depends(csrf_protect)])
def reset_password(body: ResetPasswordBody, db: Session = Depends(get_db)):
    """Reset password using token from forgot-password flow."""
    # Find valid token
    reset_token = (
        db.query(PasswordResetToken)
        .filter(
            PasswordResetToken.token == body.token,
            PasswordResetToken.used == False,  # noqa: E712
            PasswordResetToken.expires_at > datetime.now(timezone.utc),
        )
        .first()
    )

    if not reset_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token",
        )

    # Validate new password
    if len(body.new_password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 6 characters",
        )

    # Update password
    user = db.query(User).filter(User.id == reset_token.user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )

    user.password_hash = hash_password(body.new_password)
    reset_token.used = True
    db.commit()

    return {
        "message": "Password reset successful. You can now log in with your new password."
    }


@router.get("/csrf")
@router.post("/csrf")
def csrf_endpoint(resp: Response):
    """Issue a CSRF token cookie for subsequent authenticated requests.

    Frontend can call this before login/register if needed to ensure the cookie exists.
    """
    token = issue_csrf_cookie(resp)
    return {"csrf_token": token}


@router.get("/me")
def me(request: Request, user: User = Depends(get_current_user)):
    from app.config import settings

    # Diagnostic: track unlock persistence source (dev quality-of-life)
    unlock_persist = None
    if getattr(user, "dev_unlocked", False):
        session_hit = hasattr(request, "session") and bool(
            request.session.get("dev_unlocked")
        )
        cookie_hit = request.cookies.get("dev_unlocked") == "1"
        unlock_persist = (
            "session" if session_hit else ("cookie" if cookie_hit else None)
        )

    return {
        "email": user.email,
        "roles": [ur.role.name for ur in user.roles],
        "is_active": user.is_active,
        "is_demo": user.is_demo,  # For demo mode banner in frontend
        "dev_unlocked": bool(getattr(user, "dev_unlocked", False)),
        "unlock_persist": unlock_persist,
        "env": settings.APP_ENV or settings.ENV,
    }


@router.get("/status")
def auth_status(user: User = Depends(get_current_user)):
    """Lightweight auth canary endpoint.

    Returns {ok: true} if the access token cookie (or bearer) is valid.
    Useful for frontend bootstrapping and debugging cookie attribute issues.
    """
    return {"ok": True}
