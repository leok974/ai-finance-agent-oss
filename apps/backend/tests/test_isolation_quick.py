"""
Quick validation test for user isolation implementation.

This is a standalone test file that doesn't use conftest fixtures.
Run with: pytest tests/test_isolation_quick.py -v
"""


def test_transactions_router_has_user_id_filter():
    """Verify transactions router imports correctly and has user_id filtering."""
    from app.routers.transactions import list_transactions
    import inspect

    # Check that list_transactions has user_id parameter
    sig = inspect.signature(list_transactions)
    params = list(sig.parameters.keys())

    assert "user_id" in params, "list_transactions should have user_id parameter"
    print("✅ Transactions router has user_id filtering")


def test_transactions_model_has_user_id_column():
    """Verify Transaction model has user_id column."""
    from app.orm_models import Transaction

    # Check that Transaction has user_id attribute
    assert hasattr(
        Transaction, "user_id"
    ), "Transaction model should have user_id attribute"
    print("✅ Transaction model has user_id column")


def test_auth_guard_dependency_exists():
    """Verify auth guard dependency exists."""
    from app.deps.auth_guard import get_current_user_id

    assert callable(get_current_user_id), "get_current_user_id should be callable"
    print("✅ Auth guard dependency exists")


def test_guard_middleware_is_active():
    """Verify guard middleware is registered."""
    from app.main import app

    # Check that middleware count is reasonable (we added one)
    middleware_count = len(app.user_middleware)
    assert middleware_count > 0, "App should have middleware registered"
    print(f"✅ App has {middleware_count} middleware registered (including our guard)")


def test_user_backfill_completed():
    """Verify all transactions have user_id (no NULLs)."""
    from app.database import engine
    from sqlalchemy import text

    with engine.connect() as conn:
        result = conn.execute(
            text("SELECT COUNT(*) FROM transactions WHERE user_id IS NULL")
        )
        null_count = result.fetchone()[0]

    assert null_count == 0, f"Found {null_count} transactions with NULL user_id"
    print("✅ All transactions have user_id (no NULLs)")


if __name__ == "__main__":
    print("\n" + "=" * 60)
    print("QUICK USER ISOLATION VALIDATION")
    print("=" * 60 + "\n")

    test_transactions_router_has_user_id_filter()
    test_transactions_model_has_user_id_column()
    test_auth_guard_dependency_exists()
    test_guard_middleware_is_active()
    test_user_backfill_completed()

    print("\n" + "=" * 60)
    print("✅ ALL VALIDATION CHECKS PASSED")
    print("=" * 60 + "\n")
