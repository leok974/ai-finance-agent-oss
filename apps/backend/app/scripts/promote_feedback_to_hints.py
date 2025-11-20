"""CLI script to promote ML feedback stats to merchant hints.

Run from inside container:
    docker exec ai-finance-backend python -m app.scripts.promote_feedback_to_hints

Or as a cron job:
    0 2 * * * docker exec ai-finance-backend python -m app.scripts.promote_feedback_to_hints
"""

from __future__ import annotations

from datetime import datetime

from app.db import SessionLocal
from app.services.ml_feedback_promote import promote_feedback_to_hints


def main() -> None:
    """Promote feedback stats to hints and print summary."""
    db = SessionLocal()
    try:
        result = promote_feedback_to_hints(db=db, dry_run=False)

        timestamp = datetime.utcnow().isoformat()
        print(f"[{timestamp}] ML Feedback → Hints Promotion Complete")
        print(f"  Promoted: {len(result.promoted)} hints")
        print(f"  Skipped:  {len(result.skipped)} candidates")

        if result.promoted:
            print("\nPromoted hints:")
            for c in result.promoted:
                print(
                    f"  - {c.merchant_normalized[:40]:40} → {c.category:20} "
                    f"(confidence={c.confidence:.3f}, "
                    f"accepts={c.accept_count}, rejects={c.reject_count})"
                )

        if result.skipped:
            print("\nSkip reasons summary:")
            reasons = {}
            for skip in result.skipped:
                reason = skip.get("reason", "unknown")
                reasons[reason] = reasons.get(reason, 0) + 1
            for reason, count in sorted(reasons.items()):
                print(f"  {reason:30} {count:3} candidates")

    finally:
        db.close()


if __name__ == "__main__":
    main()
