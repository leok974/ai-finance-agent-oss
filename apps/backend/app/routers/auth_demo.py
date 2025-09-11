import os
from fastapi import APIRouter, HTTPException, Request, Response, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.orm_models import User
from app.utils.auth import create_tokens, set_auth_cookies
from app.utils.csrf import issue_csrf_cookie

router = APIRouter(prefix="/auth", tags=["auth-demo"])


@router.get("/demo_login")
def demo_login(request: Request, resp: Response, token: str, db: Session = Depends(get_db)):
    if os.getenv("DEMO_MODE", "0") != "1":
        raise HTTPException(status_code=404, detail="demo login disabled")
    if token != os.getenv("DEMO_LOGIN_TOKEN", ""):
        raise HTTPException(status_code=403, detail="invalid token")

    email = os.getenv("DEMO_LOGIN_EMAIL", "admin@local")
    u = db.query(User).filter(User.email == email).first()
    if not u:
        raise HTTPException(status_code=500, detail="demo user missing")

    roles = [ur.role.name for ur in (u.roles or [])]
    pair = create_tokens(u.email, roles)
    set_auth_cookies(resp, pair)
    issue_csrf_cookie(resp)
    return {"ok": True, "user": {"email": email}}
