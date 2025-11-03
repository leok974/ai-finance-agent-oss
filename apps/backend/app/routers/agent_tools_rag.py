# apps/backend/app/routers/agent_tools_rag.py
"""
Agent tools router for RAG capabilities.
Exposes admin-gated endpoints for knowledge management: status, rebuild, ingest, seed.
"""
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.orm import Session

from app.db import get_db
from app.utils.auth import get_current_user
from app.orm_models import User
from app.services import rag_tools


router = APIRouter(prefix="/agent/tools/rag", tags=["agent-tools"])


class ActionBody(BaseModel):
    """Generic action body for parameterized RAG actions."""

    url: Optional[str] = None
    urls: Optional[list[str]] = None
    vendor: Optional[str] = None


@router.post("/{action}")
async def rag_action(
    action: str,
    body: ActionBody,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Execute a RAG action by name.
    Supported actions: status, rebuild, ingest_url, bulk_ingest, ingest_pdf, seed
    """
    kwargs = {}
    if body.url:
        kwargs["url"] = body.url
    if body.urls:
        kwargs["urls"] = body.urls
    if body.vendor:
        kwargs["vendor"] = body.vendor

    result, _ = await rag_tools.run_action(action, user, db, **kwargs)
    return {"ok": True, "action": action, "result": result}


@router.post("/ingest_url")
async def ingest_url_form(
    url: str = Form(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Convenience endpoint: ingest a single URL (form-encoded).
    Frontend can call this directly without JSON body.
    """
    result, _ = await rag_tools.run_action("rag.ingest_url", user, db, url=url)
    return {"ok": True, "result": result}


@router.post("/ingest_pdf")
async def ingest_pdf_upload(
    file: UploadFile = File(...),
    vendor: Optional[str] = Form(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Convenience endpoint: ingest a PDF file via multipart upload.
    Reads file bytes, stores temporarily, and ingests into RAG index.
    """
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    # Read file contents
    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Empty file")

    result, _ = await rag_tools.run_action(
        "rag.ingest_pdf",
        user,
        db,
        file_bytes=contents,
        filename=file.filename,
        vendor=vendor,
    )
    return {"ok": True, "result": result}


@router.get("/status")
async def rag_status_get(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Convenience GET endpoint for RAG status (no body required).
    """
    result, _ = await rag_tools.run_action("rag.status", user, db)
    return result
