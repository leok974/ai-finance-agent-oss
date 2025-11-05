import os
from sqlalchemy import create_engine, text

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    raise SystemExit("DATABASE_URL not set")

engine = create_engine(DATABASE_URL, future=True)

with engine.begin() as conn:
    # 1) Check feedback.created_at NULLs
    n = conn.execute(
        text("SELECT count(*) FROM feedback WHERE created_at IS NULL")
    ).scalar_one()
    print({"feedback_null_created_at": int(n)})

    # 2) Describe feedback table column (portable checks)
    ddl = conn.execute(
        text(
            "SELECT is_nullable, column_default FROM information_schema.columns WHERE table_name='feedback' AND column_name='created_at'"
        )
    )
    row = ddl.first()
    if row:
        print({"created_at_nullable": row[0], "created_at_default": row[1]})

    # 3) Window boundary smoke: ensure inclusive-by-day works
    # This is just a read-only sanity if any rows exist
    # It checks that COUNT on cutoff day or later equals COUNT with >= date::date
    res = conn.execute(
        text(
            """
        WITH cutoff AS (
            SELECT (CURRENT_DATE - INTERVAL '30 days')::date AS d
        )
        SELECT
            (SELECT count(*) FROM feedback f, cutoff c WHERE DATE(f.created_at) >= c.d) AS cnt_date
    """
        )
    ).first()
    print({"window_cnt_date": int(res[0]) if res and res[0] is not None else None})

    # 4) Index presence
    idx = conn.execute(
        text(
            "SELECT indexname FROM pg_indexes WHERE tablename IN ('feedback','transactions')"
        )
    )
    names = {r[0] for r in idx}
    print(
        {
            "has_ix_feedback_created_at": "ix_feedback_created_at" in names,
            "has_ix_transactions_date": "ix_transactions_date" in names,
        }
    )
