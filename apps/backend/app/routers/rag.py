from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
import logging
import time

from app.db import SessionLocal
from app.services.rag_store import ingest_urls, semantic_search

logger = logging.getLogger(__name__)
router = APIRouter()


class IngestBody(BaseModel):
    urls: list[str]
    force: bool = False


@router.post("/agent/rag/ingest")
async def rag_ingest(body: IngestBody):
    db: Session = SessionLocal()
    start_time = time.time()
    try:
        res = await ingest_urls(db, body.urls, force=body.force)
        elapsed_ms = int((time.time() - start_time) * 1000)

        # Structured logging for ingestion
        for result in res.get("results", []):
            if result.get("status") == "ingested":
                logger.info(
                    "rag.ingest",
                    extra={
                        "url": result["url"],
                        "chunks": result.get("chunks", 0),
                        "elapsed_ms": elapsed_ms,
                    },
                )

        return res
    finally:
        db.close()


class QueryBody(BaseModel):
    q: str
    k: int = 8
    rerank: bool = True


@router.post("/agent/rag/query")
async def rag_query(body: QueryBody):
    db: Session = SessionLocal()
    start_time = time.time()
    try:
        embed_start = time.time()
        hits = await semantic_search(
            db, body.q, k=min(max(body.k, 1), 20), use_rerank=body.rerank
        )
        total_ms = int((time.time() - start_time) * 1000)

        # Structured logging for queries
        top1_score = hits[0]["score"] if hits else 0.0
        logger.info(
            "rag.query",
            extra={
                "q": body.q[:50],  # truncate long queries
                "results": len(hits),
                "total_ms": total_ms,
                "top1_score": round(top1_score, 3) if hits else None,
            },
        )

        return {"q": body.q, "hits": hits}
    finally:
        db.close()


class DriftBody(BaseModel):
    merchant: str
    last_price: float | None = None
    current_amount: float
    month: str | None = None  # 'YYYY-MM'


@router.post("/agent/tools/anomalies/subscription_drift")
async def subscription_drift(body: DriftBody):
    db: Session = SessionLocal()
    try:
        delta = None
        if body.last_price is not None:
            try:
                base = abs(body.last_price) or 1.0
                delta = (body.current_amount - body.last_price) / base
            except ZeroDivisionError:
                delta = None

        q = f"{body.merchant} pricing plans current price"
        hits = await semantic_search(db, q, k=6)
        pricing_hits = [
            h
            for h in hits
            if "$" in h["content"].replace("USD", "$")
            or "price" in h["content"].lower()
        ]
        top = pricing_hits[:3]

        return {
            "merchant": body.merchant,
            "observed": {
                "current_amount": body.current_amount,
                "last_price": body.last_price,
                "pct_change": delta,
            },
            "evidence": [
                {
                    "url": h["url"],
                    "score": h["score"],
                    "excerpt": (h["content"][:320] + "…"),
                }
                for h in top
            ],
            "explain": (
                f"We detected a change for {body.merchant}. Current charge {body.current_amount:.2f}"
                + (
                    f" vs prior {body.last_price:.2f} ({delta*100:+.1f}%)"
                    if delta is not None
                    else ""
                )
                + ". See pricing references above."
            ),
            "action_suggestion": "Create an alert rule to flag future charges > current price, or open the pricing link to confirm plan.",
        }
    finally:
        db.close()


@router.post("/agent/rag/ingest/files")
async def rag_ingest_files(
    vendor: str | None = Form(None),
    files: list[UploadFile] = File(...),
):
    db: Session = SessionLocal()
    try:
        blobs = []
        for uf in files:
            data = await uf.read()
            if not (uf.filename or "").lower().endswith(".pdf"):
                raise HTTPException(400, f"Only PDFs are supported: {uf.filename}")
            blobs.append({"filename": uf.filename, "bytes": data, "vendor": vendor})
        # lazy import to avoid circular
        from app.services.rag_store import ingest_files

        res = await ingest_files(db, blobs)
        return res
    finally:
        db.close()


@router.get("/agent/explain/card/{card_id}")
async def explain_card(
    card_id: str,
    month: str = None,
):
    """
    Explain a dashboard card using RAG.
    Example: GET /agent/explain/card/budget?month=2025-10
    """
    db: Session = SessionLocal()
    try:
        # Build query based on card
        queries = {
            "budget": f"budget overview spending tracking monthly limits {month or ''}",
            "top_categories": f"spending by category breakdown analysis {month or ''}",
            "top_merchants": f"merchant spending patterns frequent purchases {month or ''}",
        }
        query = queries.get(card_id, card_id)

        # Semantic search
        hits = await semantic_search(db, query, k=5, use_rerank=True)

        # Build explanation
        context_snippets = [h["content"][:200] for h in hits[:3]]
        explanation = (
            f"This card shows {card_id.replace('_', ' ')} information. "
            f"Based on your knowledge base: {' ... '.join(context_snippets)}"
        )

        return {
            "card_id": card_id,
            "explanation": explanation,
            "sources": [{"url": h["url"], "score": h["score"]} for h in hits[:3]],
            "next_actions": [
                {"label": "Review details", "url": f"/app/{card_id}"},
                {"label": "Set budget", "url": "/app/budget"},
            ],
        }
    finally:
        db.close()
