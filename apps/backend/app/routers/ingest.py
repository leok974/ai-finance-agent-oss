from fastapi import APIRouter, UploadFile, File, HTTPException
from typing import List
import csv, io
from ..models import Txn

router = APIRouter(tags=[ "ingest" ])

@router.post("/ingest")
async def ingest_csv(file: UploadFile = File(...)):
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Please upload a CSV file.")
    content = await file.read()
    s = content.decode("utf-8", errors="ignore")
    f = io.StringIO(s)
    reader = csv.DictReader(f)
    txns = []
    next_id = 1
    for row in reader:
        try:
            txns.append(Txn(
                id=next_id,
                date=row.get("date") or row.get("Date") or "",
                merchant=row.get("merchant") or row.get("Merchant") or "",
                description=row.get("description") or row.get("Description") or "",
                amount=float(row.get("amount") or row.get("Amount") or "0"),
                category=row.get("category") or row.get("Category") or "Unknown",
            ).model_dump())
            next_id += 1
        except Exception as e:
            # Skip bad rows but continue
            continue
    from ..main import app
    app.state.txns = txns
    return {"count": len(txns)}
