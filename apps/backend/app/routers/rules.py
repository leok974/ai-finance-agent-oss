from fastapi import APIRouter
from typing import List
from ..models import Rule

router = APIRouter()

@router.get("")
def list_rules() -> List[Rule]:
    from ..main import app
    return [Rule(**r) for r in app.state.rules]

@router.post("")
def add_rule(rule: Rule):
    from ..main import app
    app.state.rules.append(rule.model_dump())
    return {"ok": True, "rule": rule}

@router.delete("")
def clear_rules():
    from ..main import app
    app.state.rules = []
    return {"ok": True}
