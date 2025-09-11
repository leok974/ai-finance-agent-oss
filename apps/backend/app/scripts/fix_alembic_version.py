from app.db import engine
from app.utils.db_admin import ensure_alembic_version_len


if __name__ == "__main__":
    ensure_alembic_version_len(engine, 64)
    print("ok: alembic_version.version_num is VARCHAR(64)")
