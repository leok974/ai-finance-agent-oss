from typing import Iterable, Tuple

INCOME_KEYWORDS = {"payroll", "salary", "deposit", "paycheck", "refund", "rebate", "interest", "dividend", "income"}

def _looks_like_income(desc: str) -> bool:
    if not desc:
        return False
    d = desc.lower()
    return any(k in d for k in INCOME_KEYWORDS)

def detect_positive_expense_format(rows: Iterable[Tuple[float, str]], sample_size: int = 200, threshold: float = 0.7) -> bool:
    """
    Heuristic: if the majority of *expense-like* rows are positive, assume CSV uses positive expenses.
    rows: iterable of (amount, description)
    - We exclude clear income by keywords and by large positive spikes.
    - We sample up to sample_size rows to keep it fast.
    Returns True if 'expenses_are_positive' is likely.
    """
    taken = 0
    expense_candidates = 0
    positive_expense_like = 0

    for amt, desc in rows:
        if taken >= sample_size:
            break
        taken += 1

        # income by keyword
        if _looks_like_income(desc):
            continue

        # Heuristic: treat small/medium magnitudes as expenses; very large positives might be income
        abs_amt = abs(float(amt))
        if abs_amt == 0:
            continue

        # Consider as expense-like if not obviously income:
        expense_candidates += 1
        if amt > 0:
            positive_expense_like += 1

    if expense_candidates == 0:
        # Can't tell—default to "not positive-expense"
        return False

    frac = positive_expense_like / expense_candidates
    return frac >= threshold
