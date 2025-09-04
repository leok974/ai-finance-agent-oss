# debug_tables.py
from app.db import Base
import importlib

modules = ("app.db_models", "app.database", "app.models")

print("Importing possible model modules…")
for m in modules:
    try:
        importlib.import_module(m)
        print("  OK  ", m)
    except Exception as e:
        print("  SKIP", m, "->", repr(e))

print("\nTables on Base.metadata:")
tables = [t.name for t in Base.metadata.sorted_tables]
print(" ", tables)

t = Base.metadata.tables.get("transactions")
if t is None:
    print("\nNo 'transactions' table registered.")
else:
    print("\ntransactions columns:", list(t.c.keys()))
    # show origin module if possible
    try:
        # SQLAlchemy sets .__module__ on ORM class, but tables are Table objects.
        # This prints the repr which may include where it was defined.
        print("transactions table repr:", t)
    except Exception:
        pass
