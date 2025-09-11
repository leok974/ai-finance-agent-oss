from __future__ import annotations
import os
from app.db import SessionLocal
from app.orm_models import User
from app.utils.auth import hash_password, _ensure_roles


def ensure_demo_user() -> None:
    """Create a demo/admin user if it doesn't exist. Idempotent.

    Env overrides:
    - DEMO_LOGIN_EMAIL
    - DEMO_LOGIN_PASSWORD
    - DEMO_LOGIN_NAME (unused in current schema, kept for future profile fields)
    """
    email = os.getenv("DEMO_LOGIN_EMAIL", "admin@local")
    password = os.getenv("DEMO_LOGIN_PASSWORD", "admin123")
    # name not stored in current schema; reserved for future profile fields
    with SessionLocal() as db:
        u = db.query(User).filter(User.email == email).first()
        if not u:
            u = User(email=email, password_hash=hash_password(password), is_active=True)
            db.add(u)
            db.commit()
            db.refresh(u)
            # Ensure admin role
            try:
                _ensure_roles(db, u, ["admin"])  # grants admin
            except Exception:
                # best-effort; lack of roles won't block login
                pass