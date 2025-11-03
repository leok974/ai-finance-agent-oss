import re

from tests.factories.random_txn import gen_txn_dict, bulk_create_random_txns

ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def test_gen_txn_reproducible_with_seed():
    t1 = gen_txn_dict(seed=12345)
    t2 = gen_txn_dict(seed=12345)
    assert t1 == t2
    assert ISO_DATE.match(t1["date"])


def test_gen_txn_reasonable_ranges_positive_convention():
    t = gen_txn_dict(seed=7, sign_convention="positive")
    assert isinstance(t["amount"], float)
    assert t["amount"] != 0
    assert t["amount"] > 0
    assert t["category"] in {
        "groceries",
        "restaurants",
        "transport",
        "shopping",
        "entertainment",
        "utilities",
        "health",
        "income",
    }
    assert isinstance(t["merchant"], str) and len(t["merchant"]) > 0


def test_gen_txn_accounting_signs_follow_category():
    for seed in range(42, 52):
        t = gen_txn_dict(seed=seed, sign_convention="accounting")
        if t["category"] == "income":
            assert t["amount"] > 0
        else:
            assert t["amount"] < 0


def test_refund_flip_positive_convention_makes_negative_expense():
    saw_negative = False
    for seed in range(200, 260):
        t = gen_txn_dict(
            seed=seed, sign_convention="positive", allow_negative_refunds=True
        )
        if t["category"] != "income" and t["amount"] < 0:
            saw_negative = True
            break
    assert saw_negative, "expected at least one negative expense across seeds (refund)"


def test_refund_flip_accounting_convention_flips_signs():
    saw_flip = False
    for seed in range(300, 380):
        t = gen_txn_dict(
            seed=seed, sign_convention="accounting", allow_negative_refunds=True
        )
        if (t["category"] != "income" and t["amount"] > 0) or (
            t["category"] == "income" and t["amount"] < 0
        ):
            saw_flip = True
            break
    assert (
        saw_flip
    ), "expected at least one flipped sign across seeds in accounting mode"


def test_bulk_create_random_txns_unique_ids():
    txns = bulk_create_random_txns(client=None, n=5, seed=123)
    ids = [t["id"] for t in txns]
    assert len(ids) == 5
    assert len(set(ids)) == 5
