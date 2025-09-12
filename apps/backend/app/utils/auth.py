import base64
import hashlib
import hmac
import json
import os
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Optional

from fastapi import Depends, HTTPException, Request, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.orm_models import User, Role, UserRole


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(data: str) -> bytes:
    pad = '=' * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + pad)


def _json(data: dict) -> bytes:
    return json.dumps(data, separators=(",", ":"), sort_keys=True).encode("utf-8")


def _now_ts() -> int:
    return int(time.time())


# cookie settings
def _cookie_secure() -> bool:
    return os.environ.get("COOKIE_SECURE", "0") == "1"


def _cookie_samesite() -> str:
    return os.environ.get("COOKIE_SAMESITE", "lax")


def _cookie_domain() -> Optional[str]:
    return os.environ.get("COOKIE_DOMAIN") or None


def _refresh_max_age() -> int:
    days = int(os.environ.get("REFRESH_TOKEN_EXPIRE_DAYS", "14"))
    return days * 24 * 3600


class Tokens(BaseModel):
    token_type: str = "bearer"
    access_token: str
    refresh_token: str
    expires_in: int


def _sign_jwt(payload: dict, secret: str, alg: str = "HS256") -> str:
    if alg != "HS256":
        # Minimal implementation: only HS256 supported here
        raise ValueError("Unsupported alg; only HS256 is supported in this build")
    header = {"alg": alg, "typ": "JWT"}
    h = _b64url_encode(_json(header))
    p = _b64url_encode(_json(payload))
    msg = f"{h}.{p}".encode("ascii")
    sig = hmac.new(secret.encode("utf-8"), msg, hashlib.sha256).digest()
    s = _b64url_encode(sig)
    return f"{h}.{p}.{s}"


def _verify_jwt(token: str, secret: str) -> dict:
    try:
        h, p, s = token.split(".")
    except ValueError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Malformed token")
    msg = f"{h}.{p}".encode("ascii")
    sig = _b64url_decode(s)
    good = hmac.new(secret.encode("utf-8"), msg, hashlib.sha256).digest()
    if not hmac.compare_digest(sig, good):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Bad signature")
    payload = json.loads(_b64url_decode(p).decode("utf-8"))
    # exp, iss, aud checks
    exp = int(payload.get("exp", 0))
    if exp and _now_ts() > exp:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired")
    iss = payload.get("iss")
    aud = payload.get("aud")
    if iss and iss != settings.__dict__.get("AUTH_ISSUER", "finance-agent"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Bad issuer")
    if aud and aud != settings.__dict__.get("AUTH_AUDIENCE", "finance-agent-app"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Bad audience")
    return payload


def create_tokens(email: str, roles: list[str]) -> Tokens:
    secret = os.getenv("AUTH_SECRET", getattr(settings, "AUTH_SECRET", "dev-secret"))
    alg = os.getenv("AUTH_ALG", getattr(settings, "AUTH_ALG", "HS256"))
    access_min = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", getattr(settings, "ACCESS_TOKEN_EXPIRE_MINUTES", 30)))
    refresh_days = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", getattr(settings, "REFRESH_TOKEN_EXPIRE_DAYS", 14)))
    iss = os.getenv("AUTH_ISSUER", getattr(settings, "AUTH_ISSUER", "finance-agent"))
    aud = os.getenv("AUTH_AUDIENCE", getattr(settings, "AUTH_AUDIENCE", "finance-agent-app"))

    now = _now_ts()
    access_payload = {
        "sub": email,
        "roles": roles,
        "type": "access",
        "iat": now,
        "exp": now + access_min * 60,
        "iss": iss,
        "aud": aud,
    }
    refresh_payload = {
        "sub": email,
        "roles": roles,
        "type": "refresh",
        "iat": now,
        "exp": now + refresh_days * 24 * 3600,
        "iss": iss,
        "aud": aud,
    }
    at = _sign_jwt(access_payload, secret, alg)
    rt = _sign_jwt(refresh_payload, secret, alg)
    return Tokens(access_token=at, refresh_token=rt, expires_in=access_min * 60)


def decode_token(token: str) -> dict:
    secret = os.getenv("AUTH_SECRET", getattr(settings, "AUTH_SECRET", "dev-secret"))
    return _verify_jwt(token, secret)


def _pbkdf2(password: str, salt: bytes, iterations: int = 200_000) -> bytes:
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations, dklen=32)


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    iters = 200_000
    dk = _pbkdf2(password, salt, iters)
    return f"pbkdf2_sha256${iters}${base64.b64encode(salt).decode()}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, iters_str, salt_b64, hexhash = stored.split("$")
        iters = int(iters_str)
        salt = base64.b64decode(salt_b64)
        dk = _pbkdf2(password, salt, iters)
        return hmac.compare_digest(dk.hex(), hexhash)
    except Exception:
        return False


bearer_scheme = HTTPBearer(auto_error=False)


def set_auth_cookies(resp: Response, pair: "Tokens") -> None:
    resp.set_cookie(
        "access_token", pair.access_token,
        max_age=pair.expires_in, httponly=True, secure=_cookie_secure(),
        samesite=_cookie_samesite(), path="/", domain=_cookie_domain(),
    )
    resp.set_cookie(
        "refresh_token", pair.refresh_token,
        max_age=_refresh_max_age(), httponly=True, secure=_cookie_secure(),
        samesite=_cookie_samesite(), path="/", domain=_cookie_domain(),
    )


def clear_auth_cookies(resp: Response) -> None:
    for name in ("access_token", "refresh_token"):
        resp.delete_cookie(name, path="/", domain=_cookie_domain())


def get_current_user(
    request: Request,
    creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    # Dev bypass
    if os.getenv("DEV_ALLOW_NO_AUTH", getattr(settings, "DEV_ALLOW_NO_AUTH", False)) in (True, "1", 1, "true", "True"):
        if not creds:
            u = db.query(User).filter(User.email == "dev@local").first()
            if not u:
                u = User(email="dev@local", password_hash=hash_password("dev"))
                db.add(u); db.commit(); db.refresh(u)
                _ensure_roles(db, u, ["user"])  # minimal role
            return u

    token: Optional[str] = None
    if creds and creds.scheme and creds.scheme.lower() == "bearer":
        token = creds.credentials
    # fallback to cookie
    if not token:
        token = request.cookies.get("access_token")

    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing credentials")
    payload = decode_token(token)
    if payload.get("type") != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")
    email = payload.get("sub")
    if not email:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")
    u = db.query(User).filter(User.email == email, User.is_active == True).first()  # noqa: E712
    if not u:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or disabled")
    return u


def require_roles(*allowed: str) -> Callable[[User], User]:
    def _dep(user: User = Depends(get_current_user)) -> User:
        if not allowed:
            return user
        user_roles = {ur.role.name for ur in (user.roles or [])}
        if user_roles.intersection(set(allowed)):
            return user
        # Dev bypass may allow, otherwise 403
        if os.getenv("DEV_ALLOW_NO_AUTH", getattr(settings, "DEV_ALLOW_NO_AUTH", False)) in (True, "1", 1, "true", "True"):
            return user
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient role")
    return _dep


def _ensure_roles(db: Session, user: User, roles: list[str]):
    # ensure roles exist
    existing = {r.name: r for r in db.query(Role).filter(Role.name.in_(roles)).all()}
    to_create = [r for r in roles if r not in existing]
    for name in to_create:
        r = Role(name=name)
        db.add(r)
        db.flush()
        existing[name] = r
    db.commit()
    # ensure mappings
    have = {(ur.role_id) for ur in user.roles}
    for name in roles:
        rid = existing[name].id
        if rid not in have:
            db.add(UserRole(user_id=user.id, role_id=rid))
    db.commit()
