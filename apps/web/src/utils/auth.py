import datetime as dt
from typing import Optional, Sequence

import jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.orm_models import User, Role, UserRole
from app.utils.env import get_env

pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer_scheme = HTTPBearer(auto_error=False)

def hash_password(p: str) -> str:
    return pwd_ctx.hash(p)

def verify_password(p: str, ph: str) -> bool:
    return pwd_ctx.verify(p, ph)

class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int

def _get_keys_and_alg():
    alg = get_env("AUTH_ALG", "HS256")
    if alg == "RS256":
        with open(get_env("AUTH_PRIVATE_KEY_PATH"), "r") as f:
            priv = f.read()
        with open(get_env("AUTH_PUBLIC_KEY_PATH"), "r") as f:
            pub = f.read()
        return priv, pub, alg
    return get_env("AUTH_SECRET", "dev-secret"), get_env("AUTH_SECRET", "dev-secret"), alg

def _base_claims(sub: str, roles: Sequence[str]) -> dict:
    iss = get_env("AUTH_ISSUER", "finance-agent")
    aud = get_env("AUTH_AUDIENCE", "finance-agent-app")
    return {"sub": sub, "roles": list(roles), "iss": iss, "aud": aud}

def create_tokens(email: str, roles: Sequence[str]) -> TokenPair:
    priv, _, alg = _get_keys_and_alg()
    now = dt.datetime.utcnow()
    access_exp = now + dt.timedelta(minutes=int(get_env("ACCESS_TOKEN_EXPIRE_MINUTES", "30")))
    refresh_exp = now + dt.timedelta(days=int(get_env("REFRESH_TOKEN_EXPIRE_DAYS", "14")))
    base = _base_claims(email, roles)
    access = jwt.encode({**base, "type": "access", "iat": now, "exp": access_exp}, priv, algorithm=alg)
    refresh = jwt.encode({**base, "type": "refresh", "iat": now, "exp": refresh_exp}, priv, algorithm=alg)
    return TokenPair(access_token=access, refresh_token=refresh, expires_in=int((access_exp-now).total_seconds()))

def decode_token(token: str) -> dict:
    _, pub, alg = _get_keys_and_alg()
    return jwt.decode(token, pub, algorithms=[alg], audience=get_env("AUTH_AUDIENCE", "finance-agent-app"), options={"require": ["exp", "aud", "iss"]})

def dev_allow_no_auth() -> bool:
    return get_env("DEV_ALLOW_NO_AUTH", "0") == "1"

def get_current_user(creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
                     db: Session = Depends(get_db)) -> User:
    if dev_allow_no_auth():
        # Return a synthetic user with full roles for fast UI/dev iteration
        u = db.query(User).filter(User.email == "dev@local").first()
        if not u:
            u = User(email="dev@local", password_hash=hash_password("dev"))
            db.add(u); db.commit(); db.refresh(u)
            _ensure_roles(db, u, ["admin", "analyst", "user"])
        return u

    if not creds or not creds.scheme.lower() == "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    try:
        payload = decode_token(creds.credentials)
        email = payload.get("sub")
        if not email:
            raise ValueError("Missing sub")
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    u = db.query(User).filter(User.email == email, User.is_active == True).first()  # noqa: E712
    if not u:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User disabled")
    return u

def require_roles(*required: str):
    def _dep(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> User:
        if dev_allow_no_auth():
            return user
        # Load role names quickly
        q = db.query(Role.name).join(UserRole, Role.id == UserRole.role_id).filter(UserRole.user_id == user.id)
        user_roles = {r[0] for r in q.all()}
        if not set(required).issubset(user_roles):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Requires roles: {', '.join(required)}")
        return user
    return _dep

def _ensure_roles(db: Session, user: User, role_names: Sequence[str]) -> None:
    existing = {r.name for r in db.query(Role).all()}
    needed = [rn for rn in role_names if rn not in existing]
    for rn in needed:
        db.add(Role(name=rn))
    db.commit()

    roles = db.query(Role).filter(Role.name.in_(role_names)).all()
    present = {ur.role_id for ur in user.roles}
    for r in roles:
        if r.id not in present:
            db.add(UserRole(user_id=user.id, role_id=r.id))
    db.commit()
