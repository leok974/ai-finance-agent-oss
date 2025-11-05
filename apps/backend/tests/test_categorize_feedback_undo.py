from fastapi.testclient import TestClient
from app.main import app
from app.orm_models import MerchantCategoryHint


def test_feedback_reject_then_undo(db):
    with TestClient(app) as c:
        mc = "spotify"
        cat = "subscriptions.streaming"

        # Reject first (create user_block)
        r1 = c.post(
            "/agent/tools/categorize/feedback",
            json={
                "merchant_canonical": mc,
                "category_slug": cat,
                "action": "reject",
            },
        )
        assert r1.status_code == 200

        # Verify DB has user_block
        hint = (
            db.query(MerchantCategoryHint)
            .filter_by(merchant_canonical=mc, category_slug=cat)
            .one_or_none()
        )
        assert hint is not None
        assert (hint.source or "") == "user_block"

        # Undo should delete the block
        r2 = c.post(
            "/agent/tools/categorize/feedback/undo",
            json={
                "merchant_canonical": mc,
                "category_slug": cat,
            },
        )
        assert r2.status_code == 200
        data = r2.json()
        assert data.get("ok") is True
        assert data.get("deleted") in (0, 1)

        # DB should no longer have a user_block for that pair
        hint2 = (
            db.query(MerchantCategoryHint)
            .filter_by(merchant_canonical=mc, category_slug=cat)
            .one_or_none()
        )
        assert hint2 is None

        # Second undo is idempotent (no error)
        r3 = c.post(
            "/agent/tools/categorize/feedback/undo",
            json={
                "merchant_canonical": mc,
                "category_slug": cat,
            },
        )
        assert r3.status_code == 200
        assert r3.json().get("ok") is True
