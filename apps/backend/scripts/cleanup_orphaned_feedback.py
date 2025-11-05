#!/usr/bin/env python3
"""
Cleanup script for orphaned suggestion feedback.

When transactions are deleted with replace=true, suggestion_feedback rows
have their event_id set to NULL (per ON DELETE SET NULL constraint).
This script removes old orphaned feedback to prevent table bloat.

Usage:
    docker compose -f docker-compose.prod.yml exec backend \
        python scripts/cleanup_orphaned_feedback.py [--days 90] [--dry-run]
"""
import argparse
import sys
from datetime import datetime, timedelta

# Ensure app module is importable
sys.path.insert(0, "/app")

from app.db import SessionLocal
from sqlalchemy import text


def cleanup_orphaned_feedback(days: int = 90, dry_run: bool = False) -> dict:
    """
    Delete orphaned suggestion_feedback rows older than specified days.
    
    Args:
        days: Delete feedback with event_id=NULL older than this many days
        dry_run: If True, only count rows without deleting
        
    Returns:
        dict with 'count' of rows affected and 'deleted' boolean
    """
    db = SessionLocal()
    try:
        cutoff_date = datetime.utcnow() - timedelta(days=days)
        
        # Count orphaned feedback
        count_query = text("""
            SELECT COUNT(*) 
            FROM suggestion_feedback 
            WHERE event_id IS NULL 
              AND created_at < :cutoff
        """)
        result = db.execute(count_query, {"cutoff": cutoff_date})
        count = result.scalar()
        
        if dry_run:
            print(f"[DRY RUN] Would delete {count} orphaned feedback rows older than {days} days")
            return {"count": count, "deleted": False}
        
        # Delete orphaned feedback
        delete_query = text("""
            DELETE FROM suggestion_feedback 
            WHERE event_id IS NULL 
              AND created_at < :cutoff
        """)
        db.execute(delete_query, {"cutoff": cutoff_date})
        db.commit()
        
        print(f"✅ Deleted {count} orphaned feedback rows older than {days} days")
        return {"count": count, "deleted": True}
        
    except Exception as e:
        db.rollback()
        print(f"❌ Error during cleanup: {e}", file=sys.stderr)
        raise
    finally:
        db.close()


def main():
    parser = argparse.ArgumentParser(
        description="Clean up orphaned suggestion feedback rows"
    )
    parser.add_argument(
        "--days",
        type=int,
        default=90,
        help="Delete orphaned feedback older than this many days (default: 90)"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Count rows without deleting (default: False)"
    )
    
    args = parser.parse_args()
    
    print(f"Starting orphaned feedback cleanup...")
    print(f"  Days threshold: {args.days}")
    print(f"  Dry run: {args.dry_run}")
    print()
    
    result = cleanup_orphaned_feedback(days=args.days, dry_run=args.dry_run)
    
    print()
    print("Summary:")
    print(f"  Rows affected: {result['count']}")
    print(f"  Deleted: {result['deleted']}")
    
    return 0 if result['count'] >= 0 else 1


if __name__ == "__main__":
    sys.exit(main())
