import asyncio
import time
import logging
from sqlalchemy import text
from app.db import SessionLocal

logger = logging.getLogger(__name__)


def _prune_once(cutoff_ms: int) -> int:
    """Delete analytics_events older than cutoff_ms. Returns rows deleted.
    Uses a simple DELETE with a parameterized cutoff; works for both Postgres and SQLite
    because server_ts is stored as a bigint of epoch milliseconds in both.
    """
    rows = 0
    db = SessionLocal()
    try:
        res = db.execute(
            text("DELETE FROM analytics_events WHERE server_ts < :cutoff"),
            {"cutoff": cutoff_ms},
        )
        # SQLAlchemy 1.4 keeps rowcount on the result for DML
        rows = getattr(res, "rowcount", 0) or 0
        db.commit()
    except Exception as e:
        try:
            logger.warning("analytics_retention: prune failed: %s", e)
        except Exception:
            pass
    finally:
        try:
            db.close()
        except Exception:
            pass
    return int(rows)


async def retention_loop(retention_days: int = 90, interval_hours: int = 24) -> None:
    """Background task: periodically prune analytics_events older than retention_days.
    - Computes cutoff in epoch milliseconds and deletes in batches (single delete is fine here).
    - Sleeps for interval_hours between runs.
    """
    # Validate inputs with sane minimums
    if retention_days < 1:
        retention_days = 1
    if interval_hours < 1:
        interval_hours = 1
    interval_sec = int(interval_hours * 3600)
    while True:
        try:
            now_ms = int(time.time() * 1000)
            cutoff_ms = now_ms - int(retention_days * 86400000)
            # Run prune in thread to avoid blocking event loop
            deleted = await asyncio.to_thread(_prune_once, cutoff_ms)
            try:
                logger.info(
                    "analytics_retention: pruned %s rows older than %s days",
                    deleted,
                    retention_days,
                )
            except Exception:
                pass
        except asyncio.CancelledError:
            # Task cancelled on shutdown
            raise
        except Exception as e:
            try:
                logger.warning("analytics_retention: unexpected error: %s", e)
            except Exception:
                pass
        await asyncio.sleep(interval_sec)
