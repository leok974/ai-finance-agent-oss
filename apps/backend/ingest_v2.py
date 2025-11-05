import sys

sys.path.insert(0, "/app")

from app.database import SessionLocal
from app.orm_models import RagDocument, RagChunk
from datetime import datetime

db = SessionLocal()

try:
    docs = [
        {
            "title": "Credit Card Rewards Guide",
            "content": "Credit card rewards programs offer cash back, points, or miles. Cash back cards typically return 1-5 percent on purchases. Travel cards offer points redeemable for flights and hotels. Always pay your full balance to avoid interest charges.",
            "url": "internal://guides/credit-cards",
        },
        {
            "title": "Budget Categories Best Practices",
            "content": "Common budget categories include Housing (25-30 percent), Transportation (15-20 percent), Food (10-15 percent), Utilities (5-10 percent), Savings (10-20 percent). The 50/30/20 rule suggests 50 percent needs, 30 percent wants, 20 percent savings.",
            "url": "internal://guides/budgeting",
        },
        {
            "title": "Merchant Category Detection",
            "content": "Transaction categorization uses merchant names and patterns. Common patterns include grocery stores (Kroger, Whole Foods), restaurants (McDonald, Chipotle), gas stations (Shell, BP), online shopping (Amazon, eBay), utilities (PGE, Comcast), subscriptions (Netflix, Spotify).",
            "url": "internal://guides/categorization",
        },
    ]

    ingested_count = 0
    for doc_data in docs:
        existing = db.query(RagDocument).filter_by(url=doc_data["url"]).first()
        if existing:
            print("Document already exists:", doc_data["title"])
            continue

        doc = RagDocument(
            url=doc_data["url"],
            title=doc_data["title"],
            source="manual",
            status="ok",
            fetched_at=datetime.utcnow(),
        )
        db.add(doc)
        db.flush()

        chunk = RagChunk(document_id=doc.id, chunk_index=0, text=doc_data["content"])
        db.add(chunk)
        ingested_count += 1

    db.commit()
    print("Successfully ingested", ingested_count, "documents")

    total_docs = db.query(RagDocument).count()
    total_chunks = db.query(RagChunk).count()
    print("Total:", total_docs, "documents,", total_chunks, "chunks")

except Exception as e:
    print("Error:", e)
    import traceback

    traceback.print_exc()
    db.rollback()
finally:
    db.close()
