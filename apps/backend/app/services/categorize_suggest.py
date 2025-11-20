"""Smart categorization suggestion service with ranked scoring."""

import os
import re
from collections import defaultdict
from typing import Dict, List
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.orm_models import CategoryRule, MerchantCategoryHint
from app.db import SessionLocal

# Import ML scorer (optional, may not be enabled)
from app.services import ml_scorer

# ML Feedback scoring
ML_FEEDBACK_SCORES_ENABLED = os.getenv("ML_FEEDBACK_SCORES_ENABLED", "1") == "1"

try:
    from app.services.ml_feedback_scores import (
        FeedbackKey,
        load_feedback_stats_map,
        adjust_score_with_feedback,
    )
    ML_FEEDBACK_AVAILABLE = True
except ImportError:
    ML_FEEDBACK_AVAILABLE = False

WEIGHTS = {
    "hints": 0.65,
    "rules": 0.60,
    "recurring": 0.55,
    "ml": 0.50,
    "amount": 0.15,
}


def _combine_scores(scores: List[float]) -> float:
    """Combine multiple scores using probabilistic OR: 1 - Π(1 - w_i)"""
    prod = 1.0
    for s in scores:
        prod *= 1.0 - max(0.0, min(1.0, s))
    return 1.0 - prod


def _canonicalize(merchant: str) -> str:
    """Normalize merchant name for matching."""
    m = (merchant or "").lower()
    m = re.sub(r"[^a-z0-9]+", " ", m).strip()
    return re.sub(r"\s+", " ", m)


def _blocked_for(db: Session, merchant_canonical: str) -> set[str]:
    """Return set of category slugs blocked by user feedback for merchant."""
    blocked: set[str] = set()
    for h in (
        db.query(MerchantCategoryHint)
        .filter_by(merchant_canonical=merchant_canonical)
        .all()
    ):
        if (h.source or "") == "user_block":
            blocked.add(h.category_slug)
    return blocked


def from_hints(db: Session, merchant_canonical: str) -> List[Dict]:
    """Get category suggestions from learned merchant hints."""
    out = []
    for h in (
        db.query(MerchantCategoryHint)
        .filter_by(merchant_canonical=merchant_canonical)
        .all()
    ):
        if (h.source or "") == "user_block":
            # Do not suggest blocked categories
            continue
        out.append(
            {
                "category_slug": h.category_slug,
                "score": WEIGHTS["hints"] * float(h.confidence),
                "why": [f"user/history hint ({h.source})"],
            }
        )
    return out


def from_rules(db: Session, text: str) -> List[Dict]:
    """Get category suggestions from pattern matching rules."""
    out = []
    q = (
        db.query(CategoryRule)
        .filter_by(enabled=True)
        .order_by(CategoryRule.priority.asc())
    )
    for r in q:
        if re.search(r.pattern, text, flags=re.I):
            out.append(
                {
                    "category_slug": r.category_slug,
                    "score": WEIGHTS["rules"],
                    "why": [f"matched rule `{r.pattern}` (p{r.priority})"],
                }
            )
    return out


def from_recurring(text: str, merchant: str, cadence_days: int | None) -> List[Dict]:
    """Get category suggestions based on recurring transaction patterns."""
    out = []
    # Very light heuristic: monthly cadence → subscriptions.*
    if cadence_days and 26 <= cadence_days <= 35:
        out.append(
            {
                "category_slug": "subscriptions.software",
                "score": WEIGHTS["recurring"] * 0.8,
                "why": ["monthly cadence"],
            }
        )
    # Promote known streaming keywords if present
    if re.search(
        r"spotify|netflix|hulu|disney\+|max|paramount|apple music|ytmusic|youtube premium",
        f"{text} {merchant}",
        re.I,
    ):
        out.append(
            {
                "category_slug": "subscriptions.streaming",
                "score": WEIGHTS["recurring"],
                "why": ["known streaming vendor"],
            }
        )
    return out


def from_amount(amount: float, text: str) -> List[Dict]:
    """Get category suggestions based on transaction amount patterns."""
    out = []
    if 7 <= abs(amount) <= 25 and re.search(r"spotify|ytmusic|apple music", text, re.I):
        out.append(
            {
                "category_slug": "subscriptions.streaming",
                "score": WEIGHTS["amount"] * 0.7,
                "why": ["typical streaming price band"],
            }
        )
    if re.search(r"uber|lyft", text, re.I):
        out.append(
            {
                "category_slug": "transportation.ride_hailing",
                "score": WEIGHTS["amount"] * 0.5,
                "why": ["ride hailing merchant"],
            }
        )
    return out


from app.services.ml_scorer import (
    ml as _ml_inst,
    featurize as _featurize,
    ENABLED as ML_ENABLED,
)


def from_ml(txn: Dict, all_categories: List[str]) -> List[Dict]:
    """Get category suggestions from ML model (optional)."""
    if not ML_ENABLED or not ml_scorer.HAS_SKLEARN or not all_categories:
        return []
    try:
        x = _featurize(
            txn.get("merchant", ""),
            txn.get("description", ""),
            float(txn.get("amount", 0) or 0),
        )
        preds = _ml_inst.predict_topk(x, all_categories, k=3) or []
        return [
            {
                "category_slug": cat,
                "score": WEIGHTS["ml"] * float(p),
                "why": [f"ml scorer p={p:.2f}"],
            }
            for cat, p in preds
        ]
    except Exception:
        return []


def dedupe_and_rank(cands: List[Dict]) -> List[Dict]:
    """Deduplicate and rank category suggestions."""
    buckets: Dict[str, Dict] = defaultdict(lambda: {"scores": [], "why": []})
    for c in cands:
        b = buckets[c["category_slug"]]
        b["scores"].append(c["score"])
        b["why"].extend(c.get("why", []))

    ranked = []
    for cat, agg in buckets.items():
        ranked.append(
            {
                "category_slug": cat,
                "score": round(_combine_scores(agg["scores"]), 3),
                "why": sorted(set(agg["why"])),
            }
        )
    ranked.sort(key=lambda x: x["score"], reverse=True)
    return ranked


def _prettify_slug(slug: str) -> str:
    leaf = (slug or "").split(".")[-1]
    return leaf.replace("_", " ").capitalize()


def _get_category_map(db: Session) -> tuple[dict[str, str], list[str]]:
    rows = db.execute(text("SELECT slug, label FROM categories")).fetchall()
    labels = {r[0]: r[1] for r in rows}
    all_slugs = [r[0] for r in rows]
    return labels, all_slugs


def suggest_categories_for_txn(txn: dict, db: Session | None = None) -> List[Dict]:
    """
    Get ranked category suggestions for a transaction.

    Args:
        txn: {merchant, description, amount, cadence_days?, merchant_canonical?}
        db: Optional database session (will create one if not provided)

    Returns:
        List of dicts: [{"category_slug": str, "score": float, "why": [str]}]
    """
    close = False
    if db is None:
        db, close = SessionLocal(), True
    try:
        merchant = txn.get("merchant", "") or ""
        desc = txn.get("description", "") or ""
        amount = float(txn.get("amount", 0) or 0)
        cadence_days = txn.get("cadence_days")
        merchant_canonical = txn.get("merchant_canonical") or _canonicalize(merchant)

        blocked = _blocked_for(db, merchant_canonical)

        textq = f"{merchant} {desc}"

        cands: List[Dict] = []
        cands += from_hints(db, merchant_canonical)
        cands += from_rules(db, textq)
        cands += from_recurring(textq, merchant, cadence_days)
        cands += from_amount(amount, textq)

        # Use all categories for ML so we can propose true alternates
        labels_map, all_slugs = _get_category_map(db)
        cands += from_ml(
            {"merchant": merchant, "description": desc, "amount": amount}, all_slugs
        )

        # Remove any blocked categories before ranking
        cands = [c for c in cands if c.get("category_slug") not in blocked]
        ranked = dedupe_and_rank(cands)

        # Apply ML feedback scoring if enabled
        if ML_FEEDBACK_SCORES_ENABLED and ML_FEEDBACK_AVAILABLE and merchant_canonical:
            # Collect feedback keys for all candidates
            keys = [
                FeedbackKey(merchant_normalized=merchant_canonical, category=r["category_slug"])
                for r in ranked
                if r.get("category_slug")
            ]

            if keys:
                # Batch load stats in single query
                stats_map = load_feedback_stats_map(db, keys)

                # Adjust scores based on historical feedback
                for r in ranked:
                    cat = r.get("category_slug")
                    if not cat:
                        continue
                    
                    key = FeedbackKey(merchant_normalized=merchant_canonical, category=cat)
                    stats = stats_map.get(key)
                    
                    # Adjust score with feedback
                    original_score = r["score"]
                    adjusted_score = adjust_score_with_feedback(
                        base_score=original_score,
                        merchant_normalized=merchant_canonical,
                        category=cat,
                        stats=stats,
                    )
                    
                    # Update score and track adjustment
                    if adjusted_score != original_score:
                        r["score"] = adjusted_score
                        r["why"].append(f"ml_feedback_adjusted({original_score:.3f}→{adjusted_score:.3f})")

                # Re-sort by adjusted scores
                ranked.sort(key=lambda x: x["score"], reverse=True)

        # Ensure at least 3 diverse options with priors if needed
        needed = 3 - len(ranked)
        if needed > 0:
            prior = [
                "groceries",
                "restaurants",
                "transportation.fuel",
                "subscriptions.streaming",
                "shopping.electronics",
            ]
            have = {r["category_slug"] for r in ranked}
            for slug in prior:
                if slug in blocked:
                    continue
                if slug not in have:
                    ranked.append(
                        {
                            "category_slug": slug,
                            "score": 0.35,
                            "why": ["prior fallback"],
                        }
                    )
                    have.add(slug)
                if len(ranked) >= 3:
                    break

        # Attach labels and trim to top-3
        out: List[Dict] = []
        for r in ranked[:3]:
            slug = r["category_slug"]
            label = labels_map.get(slug) or _prettify_slug(slug)
            out.append(
                {
                    "category_slug": slug,
                    "label": label,
                    "score": r["score"],
                    "why": r["why"],
                }
            )
        return out
    finally:
        if close:
            db.close()
