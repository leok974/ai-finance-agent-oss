# ORM: your canonical SQLAlchemy model lives in app/transactions.py
try:
	from app.transactions import Transaction as Txn, Transaction
except Exception as e:
	# If transactions.py has a different class name, adjust this alias
	raise

# Pydantic request model: try common locations
try:
	from app.schemas.txns import CategorizeRequest   # prefer module form
except Exception:
	try:
		from app.schemas import CategorizeRequest    # fallback if flat schemas.py
	except Exception as e:
		# If your project names it differently, we'll detect below with Select-String
		raise

__all__ = ["Txn", "Transaction", "CategorizeRequest"]

"""
Convenience re-exports so routers can import:

	from app.models import Txn, Transaction, CategorizeRequest

Txn is the Pydantic model used in responses, Transaction is the SQLAlchemy ORM.
CategorizeRequest is a Pydantic schema resolved from common locations.
"""

# Pydantic Txn model (used to construct response items)
try:
	from app.schemas.txns import Txn  # preferred location
except Exception:
	try:
		from app.models import Txn  # legacy location in models.py
	except Exception as e:
		raise

# ORM: canonical SQLAlchemy model lives in app/transactions.py
try:
	from app.transactions import Transaction
except Exception as e:
	raise

# Pydantic request model: try common locations
try:
	from app.schemas.txns import CategorizeRequest   # preferred
except Exception:
	try:
		from app.schemas import CategorizeRequest    # fallback if flat schemas.py
	except Exception:
		# Final fallback: old location alongside other Pydantic models
		from app.models import CategorizeRequest

__all__ = ["Txn", "Transaction", "CategorizeRequest"]

