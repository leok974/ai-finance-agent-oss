import asyncio
from sqlalchemy.orm import Session
from app.db import SessionLocal
from app.services.rag_store import ingest_urls

VENDOR_URLS = [
    "https://www.spotify.com/us/premium/",
    "https://www.netflix.com/signup/planform",
    "https://www.dropbox.com/plans",
    "https://slack.com/pricing",
    "https://zoom.us/pricing",
    "https://www.atlassian.com/software/jira/pricing",
    "https://workspace.google.com/pricing.html",
    "https://www.microsoft.com/en-us/microsoft-365/business",
]


async def main():
    db: Session = SessionLocal()
    try:
        res = await ingest_urls(db, VENDOR_URLS, force=False)
        print(res)
    finally:
        db.close()


if __name__ == "__main__":
    asyncio.run(main())
