from fastapi import APIRouter, Depends, HTTPException, status, Response, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.orm_models import User
from app.utils.auth import create_tokens, verify_password, hash_password, get_current_user, _ensure_roles, set_auth_cookies, clear_auth_cookies, decode_token

router = APIRouter(prefix="/auth", tags=["auth"])

class LoginBody(BaseModel):
    email: str
    password: str

class RegisterBody(BaseModel):
    email: str
    password: str
    roles: list[str] = ["user"]

@router.post("/login")
def login(body: LoginBody, db: Session = Depends(get_db), resp: Response = None):
    u = db.query(User).filter(User.email == body.email).first()
    if not u or not verify_password(body.password, u.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    # Load roles
    roles = [ur.role.name for ur in u.roles]
    pair = create_tokens(u.email, roles)
    if resp is not None:
        set_auth_cookies(resp, pair)
    return pair.model_dump()

@router.post("/register")
def register(body: RegisterBody, db: Session = Depends(get_db), resp: Response = None):
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")
    u = User(email=body.email, password_hash=hash_password(body.password))
    db.add(u); db.commit(); db.refresh(u)
    _ensure_roles(db, u, body.roles)
    roles = body.roles
    pair = create_tokens(u.email, roles)
    if resp is not None:
        set_auth_cookies(resp, pair)
    return pair.model_dump()

@router.post("/refresh")
def refresh(token: str | None = None, db: Session = Depends(get_db), resp: Response = None, request: Request | None = None):
    # Accept token either from body or cookie
    tok = token or (request.cookies.get("refresh_token") if request else None)
    try:
        payload = decode_token(tok or "")
        if payload.get("type") != "refresh":
            raise ValueError("Not a refresh token")
        email = payload["sub"]
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Bad refresh token")
    # re-check user status from DB
    u = db.query(User).filter(User.email == email, User.is_active == True).first()  # noqa: E712
    if not u:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User disabled")
    roles = [ur.role.name for ur in u.roles]
    pair = create_tokens(email, roles)
    if resp is not None:
        set_auth_cookies(resp, pair)
    return pair.model_dump()

@router.post("/logout")
def logout(resp: Response):
    clear_auth_cookies(resp)
    return {"ok": True}

@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return {
        "email": user.email,
        "roles": [ur.role.name for ur in user.roles],
        "is_active": user.is_active,
    }
