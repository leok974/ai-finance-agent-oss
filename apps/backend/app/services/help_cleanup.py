"""Background cleanup loop for pruning expired help_cache rows.

Runs periodically (default every 30 minutes) removing rows where expires_at < now.
Skips execution entirely if no rows found or an exception occurs (logs once per failure).
"""

from __future__ import annotations
import asyncio
import logging
from datetime import datetime, timezone
from sqlalchemy import delete

from app.db import SessionLocal
from app.orm_models import HelpCache

log = logging.getLogger("help.cleanup")


async def help_cache_cleanup_loop(interval_seconds: int = 1800):  # 30m default
    # Run forever until task is cancelled at shutdown.
    while True:  # pragma: no cover (loop timing not unit tested)
        try:
            removed = 0
            with SessionLocal() as session:  # sync engine usage
                now = datetime.now(timezone.utc)
                stmt = delete(HelpCache).where(HelpCache.expires_at < now)
                res = session.execute(stmt)
                # For some dialects res.rowcount may be -1 until commit
                session.commit()
                try:
                    removed = res.rowcount or 0
                except Exception:
                    removed = 0
            if removed:
                log.info("help_cache cleanup removed %s expired rows", removed)
        except Exception as e:  # pragma: no cover (defensive logging)
            log.warning("help_cache cleanup error: %s", e)
        await asyncio.sleep(interval_seconds)
