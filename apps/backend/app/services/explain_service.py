from __future__ import annotations
from typing import Any, Dict, List, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, and_
from datetime import date, timedelta
import time
import threading
import os
from app.services.llm_flags import llm_policy

from app.transactions import Transaction  # shim to ORM
from app.orm_models import Feedback, RuleORM as Rule
from app.utils.text import canonicalize_merchant
from app.config import settings

# ---------------- In-memory TTL cache for explain responses -----------------
_CACHE_LOCK = threading.Lock()
_EXPLAIN_CACHE: Dict[Tuple[Any, ...], Tuple[float, Dict[str, Any]]] = {}
_CACHE_TTL_SECONDS = int(os.environ.get("EXPLAIN_CACHE_TTL", "600"))  # default 10 min


def _to_ts(dt_val) -> float:
    try:
        return float(getattr(dt_val, "timestamp", lambda: 0.0)())
    except Exception:
        return 0.0


def _sources_signature(
    db: Session, txn: Transaction, mcanon: Optional[str]
) -> Tuple[Any, ...]:
    """Compute a signature representing the latest modification time across inputs.
    Includes: txn.updated_at, max Rule.updated_at, max Feedback.created_at for merchant group,
    and max Transaction.updated_at within the similar-merchant window.
    """
    # txn updated
    t0 = _to_ts(getattr(txn, "updated_at", None) or getattr(txn, "created_at", None))

    # rules updated
    try:
        rmax = db.query(func.max(Rule.updated_at)).scalar()
        t1 = _to_ts(rmax)
    except Exception:
        t1 = 0.0

    # Helper to create merchant filter
    def _merchant_filter_expr():
        if not mcanon:
            return None
        base = mcanon.split(" ")[0] if " " in mcanon else mcanon
        return or_(
            Transaction.merchant_canonical == mcanon,
            Transaction.merchant_canonical.like(f"{mcanon}%"),
            Transaction.merchant_canonical == base,
            Transaction.merchant_canonical.like(f"{base}%"),
        )

    # feedback latest for merchant
    t2 = 0.0
    if mcanon:
        try:
            # Join to transactions to filter by merchant canonical group
            q_fb = (
                db.query(func.max(Feedback.created_at))
                .join(Transaction, Transaction.id == Feedback.txn_id)
                .filter(_merchant_filter_expr())
            )
            fmax = q_fb.scalar()
            t2 = _to_ts(fmax)
        except Exception:
            t2 = 0.0

    # similar txns latest updated
    t3 = 0.0
    if mcanon:
        try:
            day_ref: date = txn.date or date.today()
            start_date = day_ref - timedelta(days=365)
            q_t = db.query(func.max(Transaction.updated_at)).filter(
                and_(
                    Transaction.id != txn.id,
                    _merchant_filter_expr(),
                    Transaction.date >= start_date,
                )
            )
            tmax = q_t.scalar()
            t3 = _to_ts(tmax)
        except Exception:
            t3 = 0.0

    return (round(t0, 3), round(t1, 3), round(t2, 3), round(t3, 3))


def _cache_get(key: Tuple[Any, ...]) -> Optional[Dict[str, Any]]:
    now = time.monotonic()
    with _CACHE_LOCK:
        ent = _EXPLAIN_CACHE.get(key)
        if not ent:
            return None
        exp, payload = ent
        if exp < now:
            _EXPLAIN_CACHE.pop(key, None)
            return None
        return payload


def _cache_set(key: Tuple[Any, ...], value: Dict[str, Any]):
    now = time.monotonic()
    exp = now + max(60, _CACHE_TTL_SECONDS)  # at least 1 minute
    with _CACHE_LOCK:
        # opportunistic cleanup
        if len(_EXPLAIN_CACHE) > 512:
            for k, (e, _) in list(_EXPLAIN_CACHE.items())[:64]:
                if e < now:
                    _EXPLAIN_CACHE.pop(k, None)
        _EXPLAIN_CACHE[key] = (exp, value)


def _rule_matches_txn(rule: Rule, txn: Transaction) -> bool:
    """Deterministic rule match. Mirrors logic used in rules_apply."""
    ok = True
    if getattr(rule, "merchant", None):
        ok = ok and ((txn.merchant or "").lower().find(rule.merchant.lower()) >= 0)
    if getattr(rule, "description", None):
        ok = ok and (
            (txn.description or "").lower().find(rule.description.lower()) >= 0
        )
    if getattr(rule, "pattern", None):
        patt = rule.pattern.lower()
        ok = ok and (
            (txn.merchant or "").lower().find(patt) >= 0
            or (txn.description or "").lower().find(patt) >= 0
        )
    return ok


def _find_matching_rule(db: Session, txn: Transaction) -> Optional[Rule]:
    rules: List[Rule] = (
        db.query(Rule).filter(Rule.active.is_(True)).order_by(Rule.id.asc()).all()
    )
    for r in rules:
        try:
            if _rule_matches_txn(r, txn):
                return r
        except Exception:
            continue
    return None


def _similar_txns_summary(
    db: Session, txn: Transaction, mcanon: Optional[str]
) -> Dict[str, Any]:
    if not mcanon:
        return {"total": 0, "by_category": [], "recent_samples": []}

    # Define a 365-day window ending today or relative to txn date
    day_ref: date = txn.date or date.today()
    start_date = day_ref - timedelta(days=365)

    conds = [Transaction.id != txn.id]
    # Prefer exact canonical match; also allow prefix and base-token prefix to group variants
    base = mcanon.split(" ")[0] if " " in mcanon else mcanon
    conds.append(
        or_(
            Transaction.merchant_canonical == mcanon,
            Transaction.merchant_canonical.like(f"{mcanon}%"),
            Transaction.merchant_canonical == base,
            Transaction.merchant_canonical.like(f"{base}%"),
        )
    )
    if txn.date:
        conds.append(Transaction.date >= start_date)

    q = (
        db.query(Transaction)
        .filter(and_(*conds))
        .order_by(Transaction.date.desc(), Transaction.id.desc())
        .limit(200)
    )
    rows: List[Transaction] = list(q.all())

    by_cat: Dict[str, int] = {}
    samples: List[Dict[str, Any]] = []
    for r in rows:
        c = (r.category or "Unknown").strip()
        if c and c.lower() != "unknown":
            by_cat[c] = by_cat.get(c, 0) + 1
        # Keep a few most recent samples for UI/debug
        if len(samples) < 5:
            samples.append(
                {
                    "id": r.id,
                    "date": r.date.isoformat() if r.date else None,
                    "merchant": r.merchant,
                    "amount": float(r.amount or 0.0),
                    "category": r.category or "Unknown",
                }
            )

    total = sum(by_cat.values())
    by_category = [
        {
            "category": k,
            "count": v,
            "share": (float(v) / float(total)) if total else 0.0,
        }
        for k, v in sorted(by_cat.items(), key=lambda kv: kv[1], reverse=True)
    ]
    return {"total": total, "by_category": by_category, "recent_samples": samples}


def _feedback_summary(
    db: Session, txn: Transaction, mcanon: Optional[str]
) -> Dict[str, Any]:
    # Feedback for the specific transaction
    own: List[Dict[str, Any]] = []
    try:
        fbs = (
            db.query(Feedback)
            .filter(Feedback.txn_id == txn.id)
            .order_by(Feedback.created_at.desc())
            .limit(10)
            .all()
        )
        for fb in fbs:
            own.append(
                {
                    "label": fb.label,
                    "source": fb.source,
                    "created_at": fb.created_at.isoformat() if fb.created_at else None,
                }
            )
    except Exception:
        pass

    # Aggregate feedback over same merchant canonical
    agg: Dict[str, int] = {}
    if mcanon:
        try:
            rows = (
                db.query(Feedback.label, func.count(Feedback.id))
                .join(Transaction, Transaction.id == Feedback.txn_id)
                .filter(
                    or_(
                        Transaction.merchant_canonical == mcanon,
                        Transaction.merchant_canonical.like(f"{mcanon}%"),
                        Transaction.merchant_canonical
                        == (mcanon.split(" ")[0] if " " in mcanon else mcanon),
                        Transaction.merchant_canonical.like(
                            f"{(mcanon.split(' ')[0] if ' ' in mcanon else mcanon)}%"
                        ),
                    )
                )
                .group_by(Feedback.label)
                .all()
            )
            for lbl, cnt in rows:
                if lbl and lbl.lower() != "unknown":
                    agg[str(lbl)] = int(cnt or 0)
        except Exception:
            pass

    total = sum(agg.values())
    by_label = [
        {"label": k, "count": v, "share": (float(v) / float(total)) if total else 0.0}
        for k, v in sorted(agg.items(), key=lambda kv: kv[1], reverse=True)
    ]
    return {
        "txn_feedback": own,
        "merchant_feedback": {"total": total, "by_label": by_label},
    }


def compute_explain_evidence(
    db: Session, txn_id: int
) -> Tuple[Transaction, Dict[str, Any]]:
    txn = db.get(Transaction, txn_id)
    if not txn:
        raise ValueError("Transaction not found")

    mcanon = getattr(txn, "merchant_canonical", None) or canonicalize_merchant(
        txn.merchant
    )
    rule = _find_matching_rule(db, txn)
    similar = _similar_txns_summary(db, txn, mcanon)
    fb = _feedback_summary(db, txn, mcanon)

    evidence: Dict[str, Any] = {
        "merchant_norm": mcanon,
        "rule_match": (
            {
                "id": rule.id,
                "pattern": rule.pattern,
                "target": getattr(rule, "target", None),
                "category": rule.category,
            }
            if rule
            else None
        ),
        "similar": similar,
        "feedback": fb,
    }
    return txn, evidence


def _pick_candidates(
    txn: Transaction, evidence: Dict[str, Any]
) -> List[Dict[str, Any]]:
    cands: List[Dict[str, Any]] = []
    # 1) Strong rule signal
    rm = evidence.get("rule_match")
    if rm and rm.get("category"):
        cands.append({"label": rm["category"], "confidence": 0.95, "source": "rule"})

    # 2) Historical category distribution
    hist = evidence.get("similar", {})
    by_cat = hist.get("by_category", []) if isinstance(hist, dict) else []
    if by_cat:
        top = by_cat[0]
        if top and top.get("category") and top.get("share"):
            # Map share -> confidence in a soft way
            conf = min(0.9, 0.6 + 0.4 * float(top["share"]))
            cand = {
                "label": top["category"],
                "confidence": float(conf),
                "source": "history",
            }
            # Avoid duplicating same label if rule already pushed it
            if not any(x["label"] == cand["label"] for x in cands):
                cands.append(cand)

    # Ensure we never output Unknown
    cands = [
        c for c in cands if c.get("label") and str(c["label"]).lower() != "unknown"
    ]
    # At least return the current txn.category if it's not Unknown to ground the response
    if not cands and (txn.category and txn.category.lower() != "unknown"):
        cands.append({"label": txn.category, "confidence": 0.5, "source": "current"})
    return cands[:3]


def render_deterministic_reasoning(
    txn: Transaction, evidence: Dict[str, Any], candidates: List[Dict[str, Any]]
) -> str:
    pieces: List[str] = []
    # Always anchor on canonical merchant
    mcanon = evidence.get("merchant_norm")
    if mcanon:
        pieces.append(f"Merchant: {mcanon}.")
    # Rule rationale
    rm = evidence.get("rule_match")
    if rm:
        tgt = rm.get("target") or "text"
        patt = rm.get("pattern")
        cat = rm.get("category")
        pieces.append(f"Matched rule on {tgt} containing '{patt}' → {cat}.")

    # History rationale
    sim = evidence.get("similar", {})
    if sim and isinstance(sim, dict) and sim.get("total", 0) > 0:
        by_cat = sim.get("by_category", [])
        if by_cat:
            top = by_cat[0]
            pieces.append(
                f"Historically, {top['category']} was used {top['count']} times for this merchant (last year)."
            )

    # Feedback rationale
    fb = evidence.get("feedback", {})
    if fb and isinstance(fb, dict):
        merch_fb = fb.get("merchant_feedback", {})
        if merch_fb.get("total", 0) > 0:
            # Mention only if there's a dominant label
            by_label = merch_fb.get("by_label", [])
            if by_label:
                top_lbl = by_label[0]
                pieces.append(
                    f"You previously labeled this merchant as {top_lbl['label']} {top_lbl['count']} times."
                )

    # Candidate summary
    if candidates:
        best = candidates[0]
        pieces.append(
            f"Top suggestion: {best['label']} ({int(float(best['confidence'])*100)}%)."
        )

    return " ".join(pieces) if pieces else "No strong signals found; keeping it simple."


def try_llm_polish(
    rationale: str, txn: Transaction, evidence: Dict[str, Any]
) -> Optional[str]:
    """Optional LLM rephrase; safe fallback to deterministic text respecting llm_policy."""
    pol = llm_policy("explain")
    if not pol.get("allow"):
        return None
    if not _take_token():
        return None
    try:
        from app.utils import llm as llm_mod

        prompt = (
            "Rewrite this explanation to be concise and friendly. "
            "Do not change any numbers or categories. Keep 1-2 sentences max.\n\n"
            f"Explanation: {rationale}"
        )
        reply, _trace = llm_mod.call_local_llm(
            model=getattr(settings, "DEFAULT_LLM_MODEL", "gpt-oss:20b"),
            messages=[
                {"role": "system", "content": "You are a helpful finance assistant."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.2,
            top_p=0.9,
        )
        return (reply or "").strip() or None
    except Exception:
        return None


def build_explain_response(
    db: Session, txn_id: int, use_llm: bool = False, allow_llm: Optional[bool] = None
) -> Dict[str, Any]:
    """Build explanation response.
    use_llm: legacy flag kept for backwards compatibility.
    allow_llm: authoritative flag (if provided) controlling whether LLM path is attempted.
    """
    pol = llm_policy("explain")
    if allow_llm is not None:
        use_llm = bool(allow_llm) and pol.get("allow", False)
    else:
        use_llm = bool(use_llm) and pol.get("allow", False)
    txn, evidence = compute_explain_evidence(db, txn_id)
    # If globally disabled, proactively purge any cached LLM variant for this txn to avoid stale reuse
    if pol.get("globally_disabled"):
        try:
            sig = _sources_signature(db, txn, evidence.get("merchant_norm"))
            model = getattr(settings, "DEFAULT_LLM_MODEL", "gpt-oss:20b")
            llm_key = ("explain", int(txn.id), sig, True, model)
            with _CACHE_LOCK:
                _EXPLAIN_CACHE.pop(llm_key, None)
        except Exception:
            pass
    # Cache key includes sources signature and LLM parameters
    sig = _sources_signature(db, txn, evidence.get("merchant_norm"))
    model = getattr(settings, "DEFAULT_LLM_MODEL", "gpt-oss:20b")
    cache_key = ("explain", int(txn.id), sig, bool(use_llm), model)
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    cand = _pick_candidates(txn, evidence)
    det = render_deterministic_reasoning(txn, evidence, cand)
    llm_text: Optional[str] = None
    if use_llm and pol.get("allow"):
        try:
            from app.utils import llm as llm_mod

            prompt = (
                "Rewrite this explanation to be concise and friendly. "
                "Do not change any numbers or categories. Keep 1-2 sentences max.\n\n"
                f"Explanation: {det}"
            )
            reply, _trace = llm_mod.call_local_llm(
                model=getattr(settings, "DEFAULT_LLM_MODEL", "gpt-oss:20b"),
                messages=[
                    {
                        "role": "system",
                        "content": "You are a helpful finance assistant.",
                    },
                    {"role": "user", "content": prompt},
                ],
                temperature=0.2,
                top_p=0.9,
            )
            llm_text = (reply or "").strip() or None
        except Exception:
            llm_text = try_llm_polish(det, txn, evidence)

    resp = {
        "txn": {
            "id": txn.id,
            "date": txn.date.isoformat() if txn.date else None,
            "merchant": txn.merchant,
            "description": txn.description or "",
            "amount": float(txn.amount or 0.0),
            "category": txn.category or "Unknown",
            "month": getattr(txn, "month", None),
        },
        "evidence": evidence,
        "candidates": cand,
        "rationale": det,
        "llm_rationale": llm_text,
        "mode": "llm" if llm_text else "deterministic",
        "actions": _suggest_actions(txn, evidence, cand),
    }
    _cache_set(cache_key, resp)
    return resp


def _suggest_actions(
    txn: Transaction, evidence: Dict[str, Any], candidates: List[Dict[str, Any]]
) -> List[str]:
    acts: List[str] = []
    if evidence.get("rule_match"):
        acts.append("Apply this rule to similar transactions")
    if candidates:
        acts.append("Accept suggested category")
    # Simple heuristics for potential transfer detection (outflow vs inflow)
    amt = float(txn.amount or 0.0)
    if amt < 0 and (txn.description or "").lower().find("transfer") >= 0:
        acts.append("Mark as transfer out")
    if amt > 0 and (txn.description or "").lower().find("transfer") >= 0:
        acts.append("Mark as transfer in")
    return acts[:3]


# ----------------------- Token bucket for LLM calls -------------------------
_TB_LOCK = threading.Lock()
_TB_CAPACITY = int(os.environ.get("LLM_BUCKET_CAPACITY", "30"))  # tokens
_TB_REFILL_PER_SEC = float(_TB_CAPACITY) / 60.0  # ~30/min
_TB_TOKENS = float(_TB_CAPACITY)
_TB_LAST = time.monotonic()


def _take_token() -> bool:
    global _TB_TOKENS, _TB_LAST
    now = time.monotonic()
    with _TB_LOCK:
        # refill
        elapsed = max(0.0, now - _TB_LAST)
        _TB_LAST = now
        _TB_TOKENS = min(float(_TB_CAPACITY), _TB_TOKENS + elapsed * _TB_REFILL_PER_SEC)
        if _TB_TOKENS >= 1.0:
            _TB_TOKENS -= 1.0
            return True
        return False
