import sys

sys.path.insert(0, "/app")

from app.database import SessionLocal
from app.orm_models import RagDocument, RagChunk
from datetime import datetime

db = SessionLocal()

try:
    # Create sample documents
    docs = [
        {
            "title": "Credit Card Rewards Guide",
            "content": "Credit card rewards programs offer cash back, points, or miles. Cash back cards typically return 1-5% on purchases. The best rewards cards often have annual fees but provide premium benefits. Travel cards offer points redeemable for flights, hotels, and rental cars. Points value varies by card - Chase Ultimate Rewards and Amex Membership Rewards offer flexible redemption. Always pay your full balance to avoid interest charges that negate rewards value.",
            "source_url": "internal://guides/credit-cards",
        },
        {
            "title": "Budget Categories Best Practices",
            "content": "Common budget categories include Housing (25-30% of income), Transportation (15-20%), Food (10-15%), Utilities (5-10%), Savings (10-20%), Entertainment (5-10%), and Debt Repayment (varies). The 50/30/20 rule suggests 50% needs, 30% wants, 20% savings. Track spending monthly to identify overspending categories. Use zero-based budgeting to give every dollar a purpose. Review and adjust categories quarterly as life circumstances change.",
            "source_url": "internal://guides/budgeting",
        },
        {
            "title": "Merchant Category Detection",
            "content": "Transaction categorization uses merchant names and patterns. Common patterns include: grocery stores (Kroger, Whole Foods, Safeway), restaurants (McDonald's, Chipotle), gas stations (Shell, BP, Exxon), online shopping (Amazon, eBay), utilities (PG&E, Comcast), and subscriptions (Netflix, Spotify, Adobe). Some merchants are ambiguous - Target and Walmart sell groceries AND general merchandise. Use merchant canonical names for consistent categorization.",
            "source_url": "internal://guides/categorization",
        },
    ]

    ingested_count = 0
    for doc_data in docs:
        # Check if already exists
        existing = (
            db.query(RagDocument).filter_by(source_url=doc_data["source_url"]).first()
        )
        if existing:
            print(f"Document already exists: {doc_data['title']}")
            continue

        # Create document
        doc = RagDocument(
            title=doc_data["title"],
            source_url=doc_data["source_url"],
            content_text=doc_data["content"],
            chunk_count=1,
            word_count=len(doc_data["content"].split()),
            ingested_at=datetime.utcnow(),
        )
        db.add(doc)
        db.flush()  # Get the ID

        # Create chunk (we'll skip embeddings for now as they require NIM API)
        chunk = RagChunk(
            document_id=doc.id,
            chunk_index=0,
            text_content=doc_data["content"][:500],  # First 500 chars
            word_count=len(doc_data["content"][:500].split()),
        )
        db.add(chunk)
        ingested_count += 1

    db.commit()
    print(f"Successfully ingested {ingested_count} documents")

    # Count total documents
    total = db.query(RagDocument).count()
    print(f"Total RAG documents in database: {total}")

except Exception as e:
    print(f"Error: {e}")
    import traceback

    traceback.print_exc()
    db.rollback()
finally:
    db.close()
