from __future__ import annotations
from typing import Any, Dict
from sqlalchemy.orm import Session

from app.models import Rule


def _map_to_fields(rule_input: Any) -> Dict[str, Any]:
    """Map flexible web rule input to ORM Rule fields.
    Expected shape: { name?, enabled?, when{ description_like? | merchant_like? | merchant? }, then{ category } }
    """
    when = (getattr(rule_input, "when", None) or (rule_input.get("when") if isinstance(rule_input, dict) else {})) or {}
    then = (getattr(rule_input, "then", None) or (rule_input.get("then") if isinstance(rule_input, dict) else {})) or {}
    category = then.get("category") if isinstance(then, dict) else getattr(then, "category", None)
    if not category:
        raise ValueError("then.category is required")

    target = None
    pattern = None
    if isinstance(when, dict):
        if when.get("description_like"):
            target = "description"
            pattern = str(when.get("description_like"))
        elif when.get("merchant_like"):
            target = "merchant"
            pattern = str(when.get("merchant_like"))
        elif when.get("merchant"):
            target = "merchant"
            pattern = str(when.get("merchant"))

    enabled = True
    if isinstance(rule_input, dict):
        enabled = bool(rule_input.get("enabled", True))
    else:
        enabled = bool(getattr(rule_input, "enabled", True))

    return {"pattern": pattern, "target": target, "category": category, "active": enabled}


def create_rule(db: Session, rule_input: Any) -> Rule:
    """Persist rule and return the ORM row.
    Also computes a display name (not persisted) in the form "{like|Any} → {category|Uncategorized}" and attaches it to the returned ORM row as `display_name`.
    """
    fields = _map_to_fields(rule_input)

    # Derive a default display name from provided name/pattern/category
    def _default_rule_name(pattern: str | None, category: str | None, provided: str | None = None) -> str:
        left = (provided or "").strip() or (pattern or "").strip() or "Any"
        right = (category or "Uncategorized").strip()
        return f"{left} → {right}"

    provided_name = None
    if isinstance(rule_input, dict):
        provided_name = rule_input.get("name")
    else:
        provided_name = getattr(rule_input, "name", None)

    display_name = _default_rule_name(fields.get("pattern"), fields.get("category"), provided_name)

    r = Rule(
        pattern=fields.get("pattern"),
        target=fields.get("target"),
        category=fields["category"],
        active=fields.get("active", True),
    )
    db.add(r)
    db.commit()
    db.refresh(r)
    # Attach transient display name for callers that want it
    try:
        setattr(r, "display_name", display_name)
    except Exception:
        pass
    return r
