# Shim module to provide a stable import path for the Transaction ORM model.
from app.orm_models import Transaction as Transaction  # re-export

__all__ = ["Transaction"]
