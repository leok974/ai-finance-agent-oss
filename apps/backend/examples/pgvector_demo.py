#!/usr/bin/env python3
"""
Example: Semantic Search with pgvector

This script demonstrates:
1. Creating documents and chunks
2. Generating embeddings (mock for demo)
3. Performing KNN semantic search
4. Filtering by vendor and distance

For production, replace mock embeddings with real ones from:
- OpenAI: openai.embeddings.create(model="text-embedding-3-small", input=text)
- Nomic: requests.post("http://ollama:11434/api/embeddings", ...)
"""
import os
import sys
from pathlib import Path

# Add backend to path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from app.db import get_db
from app.repositories.rag_repository import get_rag_repo
import numpy as np

# Configuration
EMBED_DIM = int(os.getenv("EMBED_DIM", "1536"))


def generate_mock_embedding(text: str) -> list[float]:
    """
    Generate a mock embedding for demonstration.

    In production, replace with real embedding API:
    - OpenAI: openai.embeddings.create(model="text-embedding-3-small", input=text)
    - Nomic via Ollama: POST /api/embeddings with model="nomic-embed-text"
    """
    # Deterministic mock based on text hash for reproducibility
    np.random.seed(hash(text) % (2**32))
    embedding = np.random.randn(EMBED_DIM).astype(np.float32)
    # Normalize for cosine distance (common practice)
    embedding = embedding / np.linalg.norm(embedding)
    return embedding.tolist()


def main():
    print("🚀 pgvector Semantic Search Demo\n")
    print(f"Embedding Dimension: {EMBED_DIM}")
    print(f"Database: {os.getenv('DATABASE_URL', 'sqlite:///data/finance.db')}\n")

    # Get database session
    db = next(get_db())
    rag_repo = get_rag_repo(db)

    # Check if we're using Postgres with pgvector
    if not rag_repo._is_postgres:
        print("⚠️  Warning: Running on SQLite (no vector search)")
        print("   Set DATABASE_URL to Postgres for full functionality\n")

    # ======================
    # 1. Create Documents
    # ======================
    print("📄 Creating sample documents...")

    doc_netflix = rag_repo.create_document(
        source="url",
        url="https://help.netflix.com/charges",
        title="Netflix Billing Help",
        vendor="netflix",
        content_hash="netflix_charges_v1",
    )

    doc_spotify = rag_repo.create_document(
        source="url",
        url="https://support.spotify.com/subscription",
        title="Spotify Subscription Guide",
        vendor="spotify",
        content_hash="spotify_sub_v1",
    )

    doc_general = rag_repo.create_document(
        source="file",
        title="Personal Finance Tips",
        vendor="internal",
        content_hash="finance_tips_v1",
    )

    db.commit()
    print(f"✅ Created {rag_repo.count_documents()} documents\n")

    # ======================
    # 2. Add Chunks with Embeddings
    # ======================
    print("📝 Adding content chunks with embeddings...")

    sample_contents = [
        # Netflix chunks
        (
            doc_netflix.id,
            0,
            "Netflix charges your payment method on the billing date. If the payment fails, we'll try again over several days.",
        ),
        (
            doc_netflix.id,
            1,
            "You can update your payment method in Account Settings. We accept credit cards, debit cards, and PayPal.",
        ),
        (
            doc_netflix.id,
            2,
            "To cancel your subscription, go to Account > Cancel Membership. You'll have access until the end of your billing period.",
        ),
        # Spotify chunks
        (
            doc_spotify.id,
            0,
            "Spotify Premium costs $10.99/month. Students get 50% off with valid student email verification.",
        ),
        (
            doc_spotify.id,
            1,
            "You can change your plan or cancel anytime from your account page. No cancellation fees apply.",
        ),
        (
            doc_spotify.id,
            2,
            "Family plans allow up to 6 accounts for $16.99/month. All members must live at the same address.",
        ),
        # General finance chunks
        (
            doc_general.id,
            0,
            "Track your subscriptions monthly to avoid forgotten charges. Cancel unused services immediately.",
        ),
        (
            doc_general.id,
            1,
            "Set up calendar reminders before free trials end to prevent automatic billing.",
        ),
        (
            doc_general.id,
            2,
            "Compare streaming service catalogs annually. You may only need one or two services at a time.",
        ),
    ]

    for doc_id, idx, content in sample_contents:
        embedding = generate_mock_embedding(content)
        rag_repo.create_chunk(
            doc_id=doc_id,
            chunk_idx=idx,
            content=content,
            embedding=embedding,
        )

    db.commit()
    print(f"✅ Created {rag_repo.count_chunks()} chunks with embeddings\n")

    # ======================
    # 3. Semantic Search
    # ======================
    print("🔍 Performing semantic searches...\n")

    # Query 1: Payment method questions
    print("Query 1: 'How do I update my payment information?'")
    query_embedding = generate_mock_embedding("How do I update my payment information?")
    results = rag_repo.search_similar(query_embedding, k=3)

    print(f"Found {len(results)} results:")
    for i, result in enumerate(results, 1):
        print(f"{i}. [{result['vendor']}] {result['content'][:80]}...")
        print(f"   Distance: {result['distance']:.4f}\n")

    # Query 2: Cancel subscription (vendor-specific)
    print("\nQuery 2: 'How to cancel my Spotify subscription?' (filtered by vendor)")
    query_embedding = generate_mock_embedding("How to cancel my Spotify subscription?")
    results = rag_repo.search_similar(query_embedding, k=3, vendor="spotify")

    print(f"Found {len(results)} Spotify-specific results:")
    for i, result in enumerate(results, 1):
        print(f"{i}. {result['content'][:80]}...")
        print(f"   Distance: {result['distance']:.4f}\n")

    # Query 3: Billing frequency
    print("\nQuery 3: 'When will I be charged?'")
    query_embedding = generate_mock_embedding("When will I be charged?")
    results = rag_repo.search_similar(query_embedding, k=3)

    print(f"Found {len(results)} results:")
    for i, result in enumerate(results, 1):
        print(f"{i}. [{result['vendor']}] {result['title']}")
        print(f"   {result['content'][:80]}...")
        print(f"   Distance: {result['distance']:.4f}\n")

    # ======================
    # 4. Stats
    # ======================
    print("\n📊 Repository Stats:")
    print(f"   Total documents: {rag_repo.count_documents()}")
    print(f"   Total chunks: {rag_repo.count_chunks()}")
    print(f"   Netflix documents: {rag_repo.count_documents(vendor='netflix')}")
    print(f"   Spotify documents: {rag_repo.count_documents(vendor='spotify')}")
    print(f"   Internal documents: {rag_repo.count_documents(vendor='internal')}")

    print("\n✨ Demo complete!")
    print("\n💡 Next steps:")
    print("   1. Replace generate_mock_embedding() with real embedding API")
    print("   2. Implement document ingestion pipeline")
    print("   3. Add caching for frequently accessed chunks")
    print("   4. Tune HNSW parameters based on your dataset size")
    print("\n📚 See: apps/backend/docs/PGVECTOR_GUIDE.md for details")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback

        traceback.print_exc()
        sys.exit(1)
