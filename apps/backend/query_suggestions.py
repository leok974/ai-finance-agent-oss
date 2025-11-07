import sys

sys.path.insert(0, ".")
from app.database import engine
from sqlalchemy import text

with engine.connect() as conn:
    result = conn.execute(
        text(
            "SELECT id, txn_id, label, source, model_version, accepted "
            "FROM suggestions ORDER BY timestamp DESC LIMIT 5"
        )
    )
    print("Latest suggestions:")
    for row in result:
        print(
            f"  ID={row[0]}, txn_id={row[1]}, label={row[2]}, "
            f"source={row[3]}, model_version={row[4]}, accepted={row[5]}"
        )
