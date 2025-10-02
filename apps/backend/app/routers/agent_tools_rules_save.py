from __future__ import annotations
from typing import Optional, Dict, Any
from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, Field
import json, os, threading, time, uuid

try:
    from app.utils.csrf import csrf_protect  # type: ignore
except Exception:  # pragma: no cover  # optional dependency fallback; see docs/coverage-ratchet.md
    def csrf_protect():  # type: ignore  # pragma: no cover
        return True  # pragma: no cover

try:
    from app.services.rules_service import create_rule as create_rule_db  # type: ignore
except Exception:  # pragma: no cover  # optional dependency fallback; see docs/coverage-ratchet.md
    create_rule_db = None  # type: ignore  # pragma: no cover

try:
    from app.services.ack_service import build_ack  # type: ignore
except Exception:  # pragma: no cover  # optional dependency fallback; see docs/coverage-ratchet.md
    def build_ack(scope: str, updated_count: int = 1) -> str:  # type: ignore  # pragma: no cover
        return f"[ack] {scope}: ok ({updated_count})"  # pragma: no cover

try:
    from app.db import get_db  # type: ignore
except Exception:  # pragma: no cover  # optional dependency fallback; see docs/coverage-ratchet.md
    def get_db():  # type: ignore  # pragma: no cover
        yield None  # pragma: no cover

router = APIRouter(prefix="/agent/tools/rules", tags=["agent-tools:rules-save"])

class _Idem:
    def __init__(self, max_items: int = 512):
        self._cache: Dict[str, Dict[str, Any]] = {}
        self._order: list[str] = []
        self._lock = threading.Lock()
        self._max = max_items

    def get(self, key: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            return self._cache.get(key)

    def put(self, key: str, value: Dict[str, Any]):
        with self._lock:
            if key in self._cache:
                return
            self._cache[key] = value
            self._order.append(key)
            if len(self._order) > self._max:
                oldest = self._order.pop(0)
                self._cache.pop(oldest, None)

_IDEM = _Idem()

_FALLBACK_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data", "rules_saved.json"))
_os_lock = threading.Lock()

def _ensure_dir():
    d = os.path.dirname(_FALLBACK_PATH)
    os.makedirs(d, exist_ok=True)

def _load_json():
    if not os.path.exists(_FALLBACK_PATH):
        return {"items": []}
    with _os_lock, open(_FALLBACK_PATH, "r", encoding="utf-8") as f:
        try:
            return json.load(f)
        except Exception:
            return {"items": []}

def _save_json(doc):
    _ensure_dir()
    with _os_lock, open(_FALLBACK_PATH, "w", encoding="utf-8") as f:
        json.dump(doc, f, indent=2, ensure_ascii=False)

class RuleThen(BaseModel):
    category: Optional[str] = None

class RuleInput(BaseModel):
    name: Optional[str] = None
    when: Dict[str, Any] = Field(default_factory=dict)
    then: RuleThen = Field(default_factory=RuleThen)

class SaveRulePayload(BaseModel):
    rule: Optional[RuleInput] = None
    scenario: Optional[str] = None
    month: Optional[str] = None
    backfill: Optional[bool] = False

class SaveRuleResponse(BaseModel):
    ok: bool = True
    id: str
    display_name: str
    source: str
    idempotency_reused: bool = False
    ack: str

@router.post("/save", response_model=SaveRuleResponse, dependencies=[Depends(csrf_protect)])
async def save_rule(
    payload: SaveRulePayload,
    idempotency_key: Optional[str] = Header(default=None, alias="Idempotency-Key"),
    db = Depends(get_db),
):
    if idempotency_key:
        hit = _IDEM.get(idempotency_key)
        if hit:
            hit2 = dict(hit)
            hit2["idempotency_reused"] = True
            return SaveRuleResponse(**hit2)

    rule = payload.rule
    if rule is None and payload.scenario:
        rule = RuleInput(
            name=f"Auto: {payload.scenario[:64]}",
            when={"scenario": payload.scenario, **({"month": payload.month} if payload.month else {})},
            then=RuleThen(),
        )
    if rule is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing rule or scenario")

    if create_rule_db and db is not None:
        try:
            created = create_rule_db(db, rule.model_dump(exclude_none=True))
            rid = str(getattr(created, "id", "")) or str(uuid.uuid4())
            display = getattr(created, "display_name", None) or (rule.name or f"Rule {rid[:8]}")
            ack = build_ack("rules.save", 1)
            resp = SaveRuleResponse(ok=True, id=rid, display_name=display, source="db", ack=ack)
        except Exception:
            doc = _load_json()
            rid = str(uuid.uuid4())
            item = {"id": rid, "rule": rule.model_dump(exclude_none=True), "created_at": int(time.time())}
            doc.setdefault("items", []).append(item)
            _save_json(doc)
            display = rule.name or f"Rule {rid[:8]}"
            ack = build_ack("rules.save.fallback", 1)
            resp = SaveRuleResponse(ok=True, id=rid, display_name=display, source="json", ack=ack)
    else:
        doc = _load_json()
        rid = str(uuid.uuid4())
        item = {"id": rid, "rule": rule.model_dump(exclude_none=True), "created_at": int(time.time())}
        doc.setdefault("items", []).append(item)
        _save_json(doc)
        display = rule.name or f"Rule {rid[:8]}"
        ack = build_ack("rules.save", 1)
        resp = SaveRuleResponse(ok=True, id=rid, display_name=display, source="json", ack=ack)

    if idempotency_key:
        # Exclude idempotency_reused so we can override cleanly on reuse
        _IDEM.put(idempotency_key, resp.model_dump(exclude={"idempotency_reused"}))

    return resp
