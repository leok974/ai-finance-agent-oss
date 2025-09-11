from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from starlette.responses import RedirectResponse
import os

from app.db import get_db
from app.orm_models import User, OAuthAccount
from app.utils.auth import create_tokens, hash_password, _ensure_roles, set_auth_cookies
from app.utils.csrf import issue_csrf_cookie
from app.utils.oauth import oauth, absolute_url
from app.utils.env import get_env

router = APIRouter(prefix="/auth", tags=["auth"])

@router.get("/github/start")
async def github_start(request: Request):
    return await oauth.github.authorize_redirect(request, absolute_url(request, "/auth/github/callback"))

@router.get("/google/start")
async def google_start(request: Request):
    return await oauth.google.authorize_redirect(request, absolute_url(request, "/auth/google/callback"), prompt="consent")

@router.get("/github/callback")
async def github_cb(request: Request, db: Session = Depends(get_db)):
    token = await oauth.github.authorize_access_token(request)
    if not token:
        raise HTTPException(401, "GitHub auth failed")
    uinfo = (await oauth.github.get("user", token=token)).json()
    emails = (await oauth.github.get("user/emails", token=token)).json()
    email = next((e["email"] for e in emails if e.get("primary") and e.get("verified")), uinfo.get("email"))
    provider_user_id = str(uinfo["id"])
    return await _finalize("github", provider_user_id, email, db)

@router.get("/google/callback")
async def google_cb(request: Request, db: Session = Depends(get_db)):
    token = await oauth.google.authorize_access_token(request)
    if not token:
        raise HTTPException(401, "Google auth failed")
    claims = token.get("userinfo")
    if not claims:
        claims = (await oauth.google.get("userinfo", token=token)).json()
    email = claims.get("email")
    provider_user_id = str(claims.get("sub"))
    return await _finalize("google", provider_user_id, email, db)

async def _finalize(provider: str, provider_user_id: str, email: str | None, db: Session):
    link = db.query(OAuthAccount).filter_by(provider=provider, provider_user_id=provider_user_id).first()
    if link:
        user = db.query(User).get(link.user_id)
    else:
        user = db.query(User).filter(User.email == email).first() if email else None
        if not user:
            user = User(email=email or f"{provider_user_id}@{provider}.oauth", password_hash=hash_password(provider_user_id))
            db.add(user); db.commit(); db.refresh(user)
            _ensure_roles(db, user, ["user"])
        link = OAuthAccount(user_id=user.id, provider=provider, provider_user_id=provider_user_id, email=email)
        db.add(link); db.commit()
    roles = [ur.role.name for ur in user.roles]
    pair = create_tokens(user.email, roles)
    redirect = os.environ.get("OAUTH_POST_LOGIN_REDIRECT", get_env("OAUTH_POST_LOGIN_REDIRECT", "http://localhost:5173/app"))
    resp = RedirectResponse(redirect)
    set_auth_cookies(resp, pair)
    issue_csrf_cookie(resp)
    return resp
