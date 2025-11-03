import sys

sys.path.insert(0, "/app")

import asyncio
from app.services.rag_store import ingest_local_files
from app.database import get_sync_db


async def main():
    files = [
        {"filename": "cc-rewards.txt", "path": "/tmp/docs/cc-rewards.txt"},
        {"filename": "budgeting.txt", "path": "/tmp/docs/budgeting.txt"},
        {"filename": "merchants.txt", "path": "/tmp/docs/merchants.txt"},
    ]

    print("Starting RAG ingestion...")
    with get_sync_db() as db:
        results = await ingest_local_files(db, files, vendor="demo", force=True)
        for r in results:
            fname = r.get("filename", "unknown")
            chunks = r.get("chunks", 0)
            print(f"Ingested: {fname} - {chunks} chunks")
    print("Ingestion complete!")


if __name__ == "__main__":
    asyncio.run(main())
