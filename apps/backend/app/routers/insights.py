from fastapi import APIRouter
from typing import Dict

router = APIRouter()

@router.get("")
def insights(month: str) -> Dict:
    # Demo insights structure
    return {
        "month": month,
        "highlights": [
            "Subscriptions down 18% vs prior month.",
            "Dining up 22% — mostly weekend spend."
        ]
    }
