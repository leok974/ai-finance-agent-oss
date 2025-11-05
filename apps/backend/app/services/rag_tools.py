# apps/backend/app/services/rag_tools.py
"""
RAG tools capabilities registry - single source of truth for admin-gated RAG actions.
Exposes: status, rebuild, ingest_url, ingest_pdf, bulk_ingest, seed (dev-only).
"""
import os
from typing import Dict, Tuple, Optional
from fastapi import HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.services.rag_store import ingest_urls, ingest_files
from app.orm_models import User


def _require_admin_dev(user: Optional[User], dev_only: bool = False) -> None:
    """
    Guard: ensure user is admin. If dev_only=True, also require dev_unlocked (PIN verified).

    Args:
        user: Current user
        dev_only: If True, requires APP_ENV=dev AND user.dev_unlocked=True

    Raises:
        HTTPException: 401 if no user, 403 if not admin or dev requirements not met
    """
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")

    # Check admin role
    roles = getattr(user, "roles", [])
    role_names = [r.name if hasattr(r, "name") else str(r) for r in roles]
    if "admin" not in role_names:
        raise HTTPException(status_code=403, detail="Admin only")

    # Dev-only actions require PIN unlock
    if dev_only:
        # Check environment
        from app.config import settings

        if settings.APP_ENV != "dev" and settings.ENV != "dev":
            raise HTTPException(
                status_code=403, detail="Dev mode disabled (production)"
            )

        # Check dev_unlocked attribute (set by /auth/dev/unlock after PIN verification)
        if not getattr(user, "dev_unlocked", False):
            raise HTTPException(
                status_code=403, detail="Dev PIN required (use /auth/dev/unlock)"
            )


async def _rag_status(db: Session) -> Dict:
    """Return RAG index statistics: doc count, chunk count, embedded count, vendors, models."""
    try:
        doc_count = db.execute(text("SELECT COUNT(*) FROM rag_documents")).scalar() or 0
        chunk_count = db.execute(text("SELECT COUNT(*) FROM rag_chunks")).scalar() or 0

        # Count chunks with embeddings
        embedded_count = (
            db.execute(
                text("SELECT COUNT(*) FROM rag_chunks WHERE LENGTH(embedding) > 0")
            ).scalar()
            or 0
        )

        # Distinct vendors
        vendors_result = db.execute(
            text("SELECT DISTINCT vendor FROM rag_documents WHERE vendor IS NOT NULL")
        ).fetchall()
        vendors = [row[0] for row in vendors_result]

        # Detected NIM models from environment
        models = []
        embed_model = os.getenv("NIM_EMBED_MODEL", "nvidia/nv-embedqa-e5-v5")
        llm_model = os.getenv(
            "NIM_LLM_MODEL", "nvidia/llama-3.1-nemotron-nano-8b-instruct"
        )
        if embed_model:
            models.append(embed_model.split("/")[-1])
        if llm_model:
            models.append(llm_model.split("/")[-1])

        return {
            "status": "ok",
            "documents": doc_count,
            "chunks": chunk_count,
            "embedded": embedded_count,
            "vendors": vendors,
            "models": models,
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


async def _rag_rebuild(db: Session) -> Dict:
    """Rebuild index: truncate rag_chunks and rag_documents, then return status."""
    try:
        db.execute(text("DELETE FROM rag_chunks"))
        db.execute(text("DELETE FROM rag_documents"))
        db.commit()
        return {"status": "ok", "message": "Index cleared (re-ingest to populate)"}
    except Exception as e:
        db.rollback()
        return {"status": "error", "message": str(e)}


async def _rag_ingest_url(db: Session, url: str) -> Dict:
    """Ingest a single URL into RAG index."""
    if not url or not url.startswith("http"):
        raise HTTPException(status_code=400, detail="Invalid URL")
    result = await ingest_urls(db, [url], force=False)
    return result


async def _rag_bulk_ingest(db: Session, urls: list) -> Dict:
    """Ingest multiple URLs into RAG index."""
    if not urls or not isinstance(urls, list):
        raise HTTPException(status_code=400, detail="Expected list of URLs")
    result = await ingest_urls(db, urls, force=False)
    return result


async def _rag_ingest_pdf(
    db: Session, file_bytes: bytes, filename: str, vendor: Optional[str] = None
) -> Dict:
    """Ingest a PDF file into RAG index."""
    files = [{"filename": filename, "bytes": file_bytes, "vendor": vendor}]
    result = await ingest_files(db, files)
    return result


async def _rag_seed(db: Session) -> Dict:
    """
    Seed RAG with starter vendor URLs (dev-only).
    Uses canonical subscription pricing pages.
    """
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
    result = await ingest_urls(db, VENDOR_URLS, force=False)
    return {"status": "ok", "seeded": len(VENDOR_URLS), "result": result}


# Action registry: maps action name -> (async handler, dev_only flag)
# Handler signature: async (db: Session, **kwargs) -> Dict
ACTIONS = {
    "rag.status": {
        "handler": lambda db, **kw: _rag_status(db),
        "dev_only": False,
        "description": "Get RAG index statistics",
    },
    "rag.rebuild": {
        "handler": lambda db, **kw: _rag_rebuild(db),
        "dev_only": False,
        "description": "Clear RAG index (delete all documents and chunks)",
    },
    "rag.ingest_url": {
        "handler": lambda db, **kw: _rag_ingest_url(db, kw.get("url", "")),
        "dev_only": False,
        "description": "Ingest a single URL into RAG index",
    },
    "rag.bulk_ingest": {
        "handler": lambda db, **kw: _rag_bulk_ingest(db, kw.get("urls", [])),
        "dev_only": False,
        "description": "Ingest multiple URLs into RAG index",
    },
    "rag.ingest_pdf": {
        "handler": lambda db, **kw: _rag_ingest_pdf(
            db, kw.get("file_bytes", b""), kw.get("filename", ""), kw.get("vendor")
        ),
        "dev_only": False,
        "description": "Ingest a PDF file into RAG index",
    },
    "rag.seed": {
        "handler": lambda db, **kw: _rag_seed(db),
        "dev_only": True,
        "description": "Seed RAG with starter vendor URLs (dev-only)",
    },
}


async def run_action(
    action: str, user: Optional[User], db: Session, **kwargs
) -> Tuple[Dict, Optional[str]]:
    """
    Execute a RAG action with admin + dev guards.

    Returns: (result_dict, file_type_hint)
    file_type_hint is 'file' for actions that handled file uploads upstream, else None.
    """
    meta = ACTIONS.get(action)
    if not meta:
        raise HTTPException(status_code=400, detail=f"Unknown action: {action}")

    # Auth + dev gate
    _require_admin_dev(user, dev_only=meta["dev_only"])

    # Execute handler
    result = await meta["handler"](db, **kwargs)
    return result, None
