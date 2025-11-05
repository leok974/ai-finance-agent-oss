from fastapi import APIRouter
from typing import List, Dict

router = APIRouter()


@router.get("")
def alerts(month: str) -> List[Dict]:
    # Demo alerts
    return [
        {"type": "overspend", "category": "Groceries", "month": month, "delta": 125.50},
        {"type": "merchant_spike", "merchant": "Uber", "month": month, "count": 9},
    ]
