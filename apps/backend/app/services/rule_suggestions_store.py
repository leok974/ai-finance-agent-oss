from app.utils.time import utc_now
from typing import List, Dict
from sqlalchemy.orm import Session
from sqlalchemy import and_
from app.orm_models import RuleSuggestionPersisted as RSP
from app.services.rule_suggestions import mine_suggestions

def to_dict(r: RSP) -> Dict:
    return {
        "id": r.id,
        "merchant": r.merchant,
        "category": r.category,
        "status": r.status,
        "count": r.count,
        "window_days": r.window_days,
        "source": r.source,
        "metrics_json": r.metrics_json,
        "last_mined_at": r.last_mined_at.isoformat() if r.last_mined_at else None,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "updated_at": r.updated_at.isoformat() if r.updated_at else None,
    }

def list_persisted(db: Session) -> List[Dict]:
    rows = db.query(RSP).order_by(RSP.status.desc(), RSP.updated_at.desc()).all()
    return [to_dict(r) for r in rows]

def upsert_from_mined(db: Session, window_days: int, min_count: int, max_results: int) -> int:
    mined = mine_suggestions(db, window_days=window_days, min_count=min_count, max_results=max_results)
    now = utc_now()
    updated = 0
    for s in mined:
        obj = db.query(RSP).filter(and_(RSP.merchant == s["merchant"], RSP.category == s["category"]))
        row = obj.one_or_none()
        if row:
            row.count = s.get("count")
            row.window_days = s.get("window_days")
            row.source = "persisted" if row.source == "persisted" else "mined"
            row.last_mined_at = now
            row.updated_at = now
        else:
            row = RSP(
                merchant=s["merchant"],
                category=s["category"],
                status="new",
                count=s.get("count"),
                window_days=s.get("window_days"),
                source="mined",
                last_mined_at=now,
                created_at=now,
                updated_at=now,
            )
            db.add(row)
        updated += 1
    db.commit()
    return updated

def set_status(db: Session, sid: int, status: str) -> Dict:
    row = db.query(RSP).filter(RSP.id == sid).one_or_none()
    if not row:
        raise ValueError("not_found")
    row.status = status
    row.updated_at = utc_now()
    db.commit()
    db.refresh(row)
    return to_dict(row)

def clear_non_new(db: Session) -> int:
    rows = db.query(RSP).filter(RSP.status != "new").all()
    n = len(rows)
    for r in rows:
        db.delete(r)
    db.commit()
    return n
