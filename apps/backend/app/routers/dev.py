from fastapi import APIRouter, Depends, Body, HTTPException, Query, status
from sqlalchemy.orm import Session
from app.db import get_db
from app.transactions import Transaction
from typing import Optional
from datetime import datetime, timezone, date
from calendar import monthrange
from app.orm_models import Feedback, User
from app.utils.auth import hash_password
from app.services.rule_suggestions import evaluate_candidate, canonicalize_merchant
import os

router = APIRouter(prefix="/api/dev", tags=["dev"])


def _dev_guard():
    """
    Enable only in dev/staging by setting:
      ALLOW_DEV_ROUTES=1
    Never enable in production.
    """
    if os.getenv("ALLOW_DEV_ROUTES") != "1":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_enabled")


@router.get("/env")
def dev_env():
    """
    Lightweight environment probe for E2E diagnostics.
    Returns only non-sensitive toggles and cookie policy info.
    Enabled only when ALLOW_DEV_ROUTES=1.
    """
    _dev_guard()

    def _truthy(v: str | None) -> bool:
        return (v or "").strip().lower() in {"1", "true", "yes", "on"}

    app_env = os.getenv("APP_ENV") or os.getenv("ENV") or "unknown"
    allow_dev_routes = _truthy(os.getenv("ALLOW_DEV_ROUTES"))
    allow_registration = _truthy(os.getenv("ALLOW_REGISTRATION"))
    cookie_domain = os.getenv("COOKIE_DOMAIN") or ""
    cookie_samesite = (os.getenv("COOKIE_SAMESITE") or "").lower() or "lax"
    cookie_secure = _truthy(os.getenv("COOKIE_SECURE"))

    return {
        "app_env": app_env,
        "allow_dev_routes": allow_dev_routes,
        "allow_registration": allow_registration,
        "cookie": {
            "domain": cookie_domain,
            "samesite": cookie_samesite,
            "secure": cookie_secure,
        },
        "csrf_required": True,  # your backend enforces CSRF on auth mutations
    }


@router.post("/seed-user", status_code=201)
def seed_user(payload: dict, db: Session = Depends(get_db)):
    """
    Create a user for E2E without enabling public registration.
    Body: { "email": "...", "password": "...", "role": "admin" (optional) }
    Returns 201 on create, 200 if already exists.
    """
    _dev_guard()
    email = (payload.get("email") or "").strip().lower()
    password = payload.get("password") or ""
    role = payload.get("role", "user")  # default to user, allow admin override
    if not email or not password:
        raise HTTPException(status_code=400, detail="email_and_password_required")

    u = db.query(User).filter(User.email == email).first()
    if u:
        return {"status": "exists"}

    u = User(email=email, password_hash=hash_password(password), is_active=True)
    # Set role if User model supports it (check your model's fields)
    if hasattr(u, "role"):
        u.role = role  # type: ignore
    elif hasattr(u, "is_admin"):
        u.is_admin = role == "admin"  # type: ignore
    db.add(u)
    db.commit()
    db.refresh(u)
    return {"status": "created", "id": getattr(u, "id", None), "role": role}


@router.get("/first-txn-id")
def first_txn_id(db: Session = Depends(get_db)):
    _dev_guard()
    r = db.query(Transaction.id).order_by(Transaction.id.asc()).first()
    return {"id": r[0] if r else None}


@router.post("/seed-suggestions")
def seed_suggestions(
    category: str = Body(..., embed=True),
    accepts: int = Body(3, embed=True),
    txn_id: Optional[int] = Body(None, embed=True),
    merchant_override: Optional[str] = Body(None, embed=True),
    db: Session = Depends(get_db),
):
    """
    Posts N 'accept' feedback rows for a single transaction to force a rule suggestion.
    Returns suggestion info if threshold is crossed.
    """
    _dev_guard()
    # Pick a transaction (explicit id or latest)
    if txn_id is None:
        txn = db.query(Transaction).order_by(Transaction.id.desc()).first()
    else:
        txn = db.query(Transaction).filter(Transaction.id == txn_id).first()
    if not txn:
        return {"ok": False, "error": "no transactions found"}

    merchant_src = merchant_override or (txn.merchant or "Unknown")
    mnorm = canonicalize_merchant(merchant_src)

    last_fb_id = None
    for _ in range(max(1, int(accepts))):
        fb = Feedback(
            txn_id=txn.id,
            label=category,  # map category -> label
            source="accept",  # treat source as action
            created_at=datetime.now(timezone.utc),
        )
        db.add(fb)
        db.flush()
        last_fb_id = fb.id

    # Evaluate after the batch
    sugg = evaluate_candidate(db, mnorm, category)
    db.commit()

    return {
        "ok": True,
        "txn_id": txn.id,
        "feedback_last_id": last_fb_id,
        "merchant_norm": mnorm,
        "category": category,
        "suggestion_id": getattr(sugg, "id", None),
    }


@router.post("/uncategorize")
def uncategorize(
    month: Optional[str] = Body(None, embed=True),  # e.g., "2025-09"
    limit: int = Body(10, embed=True),
    db: Session = Depends(get_db),
):
    """
    Sets category=NULL for up to `limit` transactions (optionally within a month).
    Useful to repopulate the ML Suggestions panel.
    """
    _dev_guard()
    q = db.query(Transaction).order_by(Transaction.id.desc())
    if month:
        q = q.filter(Transaction.month == month)
    rows = q.limit(int(limit)).all()
    for r in rows:
        r.category = None
    db.commit()
    return {"ok": True, "updated": len(rows)}


@router.post("/seed-unknowns", status_code=201)
def seed_unknowns(
    count: int = Query(6, ge=1, le=50),
    month: Optional[str] = Query(None, pattern=r"^\d{4}-\d{2}$"),
    db: Session = Depends(get_db),
):
    """Insert a handful of uncategorized expenses for the Unknowns/Undo panel."""
    _dev_guard()

    today = date.today()
    if month:
        year, mon = [int(part) for part in month.split("-")]
    else:
        year, mon = today.year, today.month
        month = f"{year}-{mon:02d}"

    start = date(year, mon, 1)
    days_in_month = monthrange(year, mon)[1]

    samples = [
        ("Coffee Galaxy", "Latte", -4.75),
        ("Green Grocer", "Snacks", -8.40),
        ("Metro Tickets", "Transit fare", -2.50),
        ("Cloud Store", "Storage charge", -3.99),
        ("Corner Mart", "Water", -1.50),
        ("Book Nook", "Notebook", -5.25),
        ("Snack Shack", "Chips", -2.10),
        ("City Bikes", "Day pass", -9.00),
    ]

    rows = []
    limit = min(count, len(samples))
    for idx in range(limit):
        merchant, desc, amt = samples[idx]
        day = min(idx + 1, days_in_month)
        txn_date = date(year, mon, day)
        rows.append(
            Transaction(
                date=txn_date,
                merchant=merchant,
                description=desc,
                amount=amt,
                category=None,
                raw_category=None,
                account="dev",
                month=f"{year}-{mon:02d}",
                merchant_canonical=canonicalize_merchant(merchant),
            )
        )

    if not rows:
        return {"inserted": 0, "month": month}

    db.add_all(rows)
    db.commit()
    return {"inserted": len(rows), "month": month}


@router.get("/unknowns/peek")
def unknowns_peek(db: Session = Depends(get_db), limit: int = Query(10, ge=1, le=50)):
    """Quick peek at uncategorized transactions for debugging."""
    _dev_guard()
    q = (
        db.query(Transaction)
        .filter(Transaction.category.is_(None))
        .order_by(Transaction.date.desc())
        .limit(limit)
    )
    items = [
        {
            "id": t.id,
            "date": t.date.isoformat() if t.date else None,
            "merchant": t.merchant,
            "amount": float(t.amount) if t.amount else 0,
        }
        for t in q
    ]
    return {"count": len(items), "items": items}
