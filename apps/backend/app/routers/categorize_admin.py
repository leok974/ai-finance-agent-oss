"""Admin endpoints for managing categorization rules."""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.db import get_db
from app.orm_models import CategoryRule
from app.utils.authz import require_admin
import re

# Apply admin-only guard to all routes in this router
router = APIRouter(dependencies=[Depends(require_admin)])


class RuleUpdate(BaseModel):
    pattern: str | None = None
    category_slug: str | None = None
    priority: int | None = None
    enabled: bool | None = None


@router.get("/agent/tools/categorize/rules")
def list_rules(db: Session = Depends(get_db)):
    """List all category rules, ordered by enabled status, priority, and ID."""
    q = db.query(CategoryRule).order_by(
        CategoryRule.enabled.desc(), CategoryRule.priority.asc(), CategoryRule.id.asc()
    )
    return [
        {
            "id": r.id,
            "pattern": r.pattern,
            "category_slug": r.category_slug,
            "priority": r.priority,
            "enabled": r.enabled,
        }
        for r in q.all()
    ]


@router.patch("/agent/tools/categorize/rules/{rule_id}")
def update_rule(rule_id: int, body: RuleUpdate, db: Session = Depends(get_db)):
    """Update a category rule's properties."""
    r = db.query(CategoryRule).filter(CategoryRule.id == rule_id).first()
    if not r:
        raise HTTPException(404, "rule not found")

    # Validate pattern if provided
    if body.pattern is not None:
        try:
            re.compile(body.pattern, flags=re.I)
        except re.error as e:
            raise HTTPException(400, f"invalid regex pattern: {e}")
        r.pattern = body.pattern

    if body.category_slug is not None:
        r.category_slug = body.category_slug
    if body.priority is not None:
        r.priority = body.priority
    if body.enabled is not None:
        r.enabled = body.enabled

    db.commit()
    db.refresh(r)

    return {
        "ok": True,
        "rule": {
            "id": r.id,
            "pattern": r.pattern,
            "category_slug": r.category_slug,
            "priority": r.priority,
            "enabled": r.enabled,
        },
    }


@router.delete("/agent/tools/categorize/rules/{rule_id}")
def delete_rule(rule_id: int, db: Session = Depends(get_db)):
    """Delete a category rule."""
    r = db.query(CategoryRule).filter(CategoryRule.id == rule_id).first()
    if not r:
        raise HTTPException(404, "rule not found")

    db.delete(r)
    db.commit()

    return {"ok": True}


class RuleTestBody(BaseModel):
    pattern: str
    samples: list[str]


@router.post("/agent/tools/categorize/rules/test")
def test_rule(body: RuleTestBody):
    """
    Test a regex pattern against sample strings.

    Returns which samples match and which don't.
    """
    failed = []
    ok = []

    try:
        rx = re.compile(body.pattern, flags=re.I)
    except re.error as e:
        return {"ok": False, "error": f"invalid regex: {e}"}

    for s in body.samples:
        if rx.search(s or ""):
            ok.append(s)
        else:
            failed.append(s)

    return {"ok": True, "matches": ok, "misses": failed}
