from __future__ import annotations
from typing import Any, Dict, Iterable, List, Tuple, Literal
import datetime as dt
import random as _random

SignConvention = Literal["positive", "accounting"]

# Lightweight domain for believable txns
_CATEGORIES: List[Tuple[str, float, List[str]]] = [
    ("groceries", 0.20, ["WholeFoods", "Trader Joes", "Safeway", "Kroger", "Aldi"]),
    (
        "restaurants",
        0.20,
        ["Chipotle", "McDonalds", "Local Diner", "Sushi Place", "Pizzeria"],
    ),
    ("transport", 0.15, ["Uber", "Lyft", "Shell", "Chevron", "Metro"]),
    ("shopping", 0.15, ["Amazon", "Target", "Walmart", "BestBuy", "IKEA"]),
    ("entertainment", 0.10, ["Netflix", "Spotify", "Movie Theater", "Bowling"]),
    ("utilities", 0.10, ["Comcast", "AT&T", "Verizon", "PG&E", "ConEd"]),
    ("health", 0.05, ["CVS", "Walgreens", "Dental Clinic", "Pharmacy"]),
    ("income", 0.05, ["ACME Corp Payroll", "Stripe Payout", "Bank Interest"]),
]


def _rng(seed: int | None) -> _random.Random:
    return _random.Random(seed) if seed is not None else _random.Random()


def _weighted_choice(
    rng: _random.Random, items: Iterable[Tuple[str, float, List[str]]]
) -> Tuple[str, List[str]]:
    # items: (category, weight, merchants)
    total = sum(w for _, w, _ in items)
    x = rng.random() * total
    cum = 0.0
    for cat, w, merchants in items:
        cum += w
        if x <= cum:
            return cat, merchants
    return list(items)[0][0:2]  # fallback (shouldn't happen)


def _random_date(
    rng: _random.Random, *, start_days_ago: int = 180, end: dt.date | None = None
) -> dt.date:
    end = end or dt.date.today()
    start = end - dt.timedelta(days=start_days_ago)
    delta_days = (end - start).days
    return start + dt.timedelta(days=rng.randrange(delta_days + 1))


def _amount_for_category(rng: _random.Random, category: str) -> float:
    base = {
        "groceries": (20, 120),
        "restaurants": (10, 70),
        "transport": (5, 60),
        "shopping": (15, 250),
        "entertainment": (5, 80),
        "utilities": (40, 300),
        "health": (10, 200),
        "income": (500, 4000),
    }
    lo, hi = base.get(category, (5, 150))
    val = rng.uniform(lo, hi)
    return round(val, 2)


def _apply_sign_convention(
    rng: _random.Random,
    amount_abs: float,
    category: str,
    *,
    sign_convention: SignConvention,
    allow_negative_refunds: bool,
) -> float:
    """Return signed amount per sign convention + occasional flips."""
    amt = amount_abs
    if sign_convention == "positive":
        if allow_negative_refunds and category != "income" and rng.random() < 0.05:
            amt = -amt
        return amt
    # accounting convention: expenses negative, income positive
    if category == "income":
        amt = +amt
    else:
        amt = -amt
    if allow_negative_refunds and rng.random() < 0.05:
        amt = -amt  # flip sign
    return amt


def gen_txn_dict(
    *,
    seed: int | None = None,
    start_days_ago: int = 180,
    allow_negative_refunds: bool = False,
    sign_convention: SignConvention = "positive",
    overrides: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    """Generate a pseudo-realistic transaction dict for POST /txns.

    sign_convention:
      - positive: all positive; occasional negative expense as refund
      - accounting: expenses negative, income positive; occasional flips for refunds/chargebacks
    """
    rng = _rng(seed)
    category, merchants = _weighted_choice(rng, _CATEGORIES)
    merchant = rng.choice(merchants)
    date = _random_date(rng, start_days_ago=start_days_ago).isoformat()
    amount_abs = _amount_for_category(rng, category)
    amount = _apply_sign_convention(
        rng,
        amount_abs,
        category,
        sign_convention=sign_convention,
        allow_negative_refunds=allow_negative_refunds,
    )
    data: Dict[str, Any] = {
        "date": date,
        "amount": amount,
        "merchant": merchant,
        "category": category,
    }
    if overrides:
        data.update(overrides)
    return data


def create_random_txn(
    client,
    *,
    seed: int | None = None,
    start_days_ago: int = 180,
    allow_negative_refunds: bool = False,
    sign_convention: SignConvention = "positive",
    overrides: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    """Create a random transaction via API using tests.factories.txns.create_txn."""
    from tests.factories.txns import create_txn  # local import to avoid cycles

    payload = gen_txn_dict(
        seed=seed,
        start_days_ago=start_days_ago,
        allow_negative_refunds=allow_negative_refunds,
        sign_convention=sign_convention,
        overrides=overrides,
    )
    return create_txn(client=client, **payload)


def bulk_create_random_txns(
    client,
    n: int,
    *,
    seed: int | None = None,
    start_days_ago: int = 180,
    allow_negative_refunds: bool = False,
    sign_convention: SignConvention = "positive",
    overrides: Dict[str, Any] | None = None,
) -> List[Dict[str, Any]]:
    """Create n diverse transactions; reproducible if seed provided."""
    rng = _rng(seed)
    out: List[Dict[str, Any]] = []
    for _ in range(n):
        sub_seed = rng.randrange(1_000_000_000)
        out.append(
            create_random_txn(
                client,
                seed=sub_seed,
                start_days_ago=start_days_ago,
                allow_negative_refunds=allow_negative_refunds,
                sign_convention=sign_convention,
                overrides=overrides,
            )
        )
    return out
