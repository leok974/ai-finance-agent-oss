import hashlib
import json
import os
from typing import List, Dict
import httpx
import math
import re
import io
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.services.rag_chunk import html_to_text, chunk_text
from app.services.embed_provider import embed_texts

# Feature flags for production-safe RAG configuration
RAG_STORE = os.getenv("RAG_STORE", "sqlite")  # "sqlite" or "pgvector"


def _sha256(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def _vec_str(v: list[float]) -> str:
    # pgvector textual literal, e.g. "[0.12,0.34,...]"
    return "[" + ",".join(f"{x:.7f}" for x in v) + "]"


def _dot(a, b):
    """Dot product with empty vector guard."""
    if not a or not b or len(a) != len(b):
        return 0.0
    return sum(x * y for x, y in zip(a, b))


def _norm(a):
    """Vector norm with empty vector guard."""
    if not a:
        return 1.0
    return math.sqrt(sum(x * x for x in a)) or 1.0


def _cos(a, b):
    """Cosine similarity with clamping to [-1, 1] for numerical stability."""
    if not a or not b or len(a) != len(b):
        return 0.0
    raw = _dot(a, b) / (_norm(a) * _norm(b))
    # Clamp to valid cosine range
    return max(-1.0, min(1.0, raw))


def _coerce_vec(v):
    # Try to coerce pgvector -> python list[float]
    if isinstance(v, (list, tuple)):
        return [float(x) for x in v]
    # Handle binary-packed embeddings from SQLite (struct.pack format)
    if isinstance(v, (bytes, memoryview)):
        import struct

        data = bytes(v) if isinstance(v, memoryview) else v
        if len(data) == 0:
            return []
        # Unpack as float array (4 bytes per float)
        num_floats = len(data) // 4
        if num_floats > 0:
            return list(struct.unpack(f"{num_floats}f", data))
        return []
    s = str(v).strip()
    # handles '[0.1, 0.2, ...]' or '(0.1,0.2,...)'
    s = s.strip("[]()")
    parts = re.split(r"[,\s]+", s)
    return [float(p) for p in parts if p]


async def fetch_url(
    url: str, etag: str | None = None, last_modified: str | None = None
):
    headers = {}
    if etag:
        headers["If-None-Match"] = etag
    if last_modified:
        headers["If-Modified-Since"] = last_modified
    async with httpx.AsyncClient(follow_redirects=True, timeout=30) as client:
        r = await client.get(url, headers=headers)
        if r.status_code == 304:
            return {"status": "not_modified"}
        r.raise_for_status()
        return {
            "status": "ok",
            "content": r.text,
            "etag": r.headers.get("ETag"),
            "last_modified": r.headers.get("Last-Modified"),
        }


def _is_postgres(db: Session) -> bool:
    try:
        bind = db.get_bind()
        return (getattr(bind.dialect, "name", None) or "").startswith("postgres")
    except Exception:
        return False


async def ingest_urls(db: Session, urls: List[str], force: bool = False) -> Dict:
    results: List[Dict] = []
    is_pg = _is_postgres(db)
    for url in urls:
        # existing doc?
        doc = db.execute(
            text(
                "SELECT id, etag, last_modified, content_hash FROM rag_documents WHERE url=:u"
            ),
            {"u": url},
        ).fetchone()
        etag = doc.etag if doc else None
        lastm = doc.last_modified if doc else None

        fetched = await fetch_url(
            url, None if force else etag, None if force else lastm
        )
        if fetched.get("status") == "not_modified":
            results.append({"url": url, "status": "skipped"})
            continue

        text_content = html_to_text(fetched["content"])
        h = _sha256(text_content)

        if doc and (not force) and h == doc.content_hash:
            results.append({"url": url, "status": "skipped"})
            continue

        # upsert rag_documents
        if doc:
            db.execute(
                text(
                    """
                UPDATE rag_documents
                SET fetched_at=NOW(), etag=:e, last_modified=:l, title=NULL, vendor=NULL,
                    content_hash=:h, status='ok', error=NULL
                WHERE id=:id
                """
                ),
                {
                    "e": fetched.get("etag"),
                    "l": fetched.get("last_modified"),
                    "h": h,
                    "id": doc.id,
                },
            )
            doc_id = doc.id
            # delete old chunks
            db.execute(text("DELETE FROM rag_chunks WHERE doc_id=:id"), {"id": doc_id})
        else:
            ins = db.execute(
                text(
                    """
                INSERT INTO rag_documents (source, url, title, vendor, etag, last_modified, content_hash, status)
                VALUES ('url', :u, NULL, NULL, :e, :l, :h, 'ok') RETURNING id
                """
                ),
                {
                    "u": url,
                    "e": fetched.get("etag"),
                    "l": fetched.get("last_modified"),
                    "h": h,
                },
            )
            doc_id = ins.fetchone()[0]

        # chunk + embed
        chunks = chunk_text(text_content)
        # meta: naive vendor guess from hostname
        from urllib.parse import urlparse

        vendor = (urlparse(url).hostname or "").replace("www.", "")
        db.execute(
            text("UPDATE rag_documents SET vendor=:v WHERE id=:id"),
            {"v": vendor, "id": doc_id},
        )
        embeddings = await embed_texts(chunks)

        # insert chunks
        for idx, (content, emb) in enumerate(zip(chunks, embeddings)):
            meta = {"url": url, "vendor": vendor, "chunk_idx": idx}
            if is_pg:
                db.execute(
                    text(
                        """
                    INSERT INTO rag_chunks (doc_id, chunk_idx, content, meta_json, embedding, embedding_vec)
                    VALUES (:d, :i, :c, :m, :b, CAST(:vec AS vector))
                    """
                    ),
                    {
                        "d": doc_id,
                        "i": idx,
                        "c": content,
                        "m": json.dumps(meta),
                        # leave raw storage empty for now
                        "b": memoryview(b""),
                        # cast-safe across psycopg variants
                        "vec": _vec_str(emb),
                    },
                )
            else:
                # Non-Postgres: store embedding as JSON array in BLOB column for cosine similarity search
                import struct

                embedding_bytes = struct.pack(f"{len(emb)}f", *emb)
                db.execute(
                    text(
                        """
                    INSERT INTO rag_chunks (doc_id, chunk_idx, content, meta_json, embedding)
                    VALUES (:d, :i, :c, :m, :b)
                    """
                    ),
                    {
                        "d": doc_id,
                        "i": idx,
                        "c": content,
                        "m": json.dumps(meta),
                        "b": embedding_bytes,
                    },
                )

        db.commit()
        results.append({"url": url, "status": "ingested", "chunks": len(chunks)})
    return {"ok": True, "results": results}


async def semantic_search(
    db: Session, query: str, k: int = 8, prefetch: int = 24, use_rerank: bool = True
) -> List[Dict]:
    [qvec] = await embed_texts([query], input_type="query")

    if not _is_postgres(db):
        # SQLite fallback: fetch all chunks and compute cosine similarity in Python
        rows = db.execute(
            text(
                """
                SELECT c.doc_id, c.chunk_idx, c.content, c.meta_json, c.embedding,
                       d.url, d.vendor, d.title
                FROM rag_chunks c
                JOIN rag_documents d ON c.doc_id = d.id
                WHERE LENGTH(c.embedding) > 0
            """
            )
        ).fetchall()

        # Compute cosine similarities
        scored = []
        for r in rows:
            emb = _coerce_vec(r.embedding)
            if emb:
                cos = _cos(qvec, emb)
                scored.append((cos, r))

        # Sort by score descending and take top k
        scored.sort(key=lambda t: t[0], reverse=True)
        top_rows = scored[:k]

        # Build results
        hits: List[Dict] = []
        for score, r in top_rows:
            hits.append(
                {
                    "doc_id": r.doc_id,
                    "chunk_idx": r.chunk_idx,
                    "content": r.content,
                    "meta": json.loads(r.meta_json or "{}"),
                    "score": float(score),
                    "url": r.url,
                    "vendor": r.vendor,
                    "title": r.title,
                }
            )
        return hits

    # PostgreSQL with pgvector
    qvec_str = _vec_str(qvec)
    rows = db.execute(
        text(
            """
        SELECT c.doc_id, c.chunk_idx, c.content, c.meta_json,
               (1 - (c.embedding_vec <=> CAST(:qvec AS vector))) AS ann_score,
               c.embedding_vec AS emb,
               d.url, d.vendor, d.title
        FROM rag_chunks c
        JOIN rag_documents d ON c.doc_id = d.id
        ORDER BY c.embedding_vec <=> CAST(:qvec AS vector)
        LIMIT :n
        """
        ),
        {"qvec": qvec_str, "n": max(prefetch, k)},
    ).fetchall()
    if use_rerank:
        rescored = []
        for r in rows:
            emb = _coerce_vec(r.emb)
            cos = _cos(qvec, emb)
            rescored.append((cos, r))
        rescored.sort(key=lambda t: t[0], reverse=True)
        rows = [r for _, r in rescored]
    hits: List[Dict] = []
    for r in rows[:k]:
        hits.append(
            {
                "doc_id": r.doc_id,
                "chunk_idx": r.chunk_idx,
                "content": r.content,
                "meta": json.loads(r.meta_json or "{}"),
                "score": (
                    float(r.ann_score)
                    if not use_rerank
                    else float(_cos(qvec, _coerce_vec(r.emb)))
                ),
                "url": r.url,
                "vendor": r.vendor,
                "title": r.title,
            }
        )
    return hits


def _pdf_bytes_to_text(data: bytes) -> str:
    # Try pypdf first (lightweight), fall back to PyPDF2
    try:
        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(data))
        return "\n\n".join((p.extract_text() or "") for p in reader.pages).strip()
    except Exception:
        try:
            from PyPDF2 import PdfReader as PyPdfReader

            reader = PyPdfReader(io.BytesIO(data))
            return "\n\n".join((p.extract_text() or "") for p in reader.pages).strip()
        except Exception as e:
            raise RuntimeError(f"PDF parse failed: {e}")


async def ingest_files(db: Session, files: List[Dict]) -> Dict:
    """
    files: list of {filename:str, bytes:bytes, vendor:Optional[str]}
    """
    results: List[Dict] = []
    is_pg = _is_postgres(db)
    for f in files:
        vendor = f.get("vendor") or (f["filename"].rsplit(".", 1)[0])
        text_content = _pdf_bytes_to_text(f["bytes"])
        if not text_content:
            results.append(
                {"file": f["filename"], "status": "skipped", "reason": "no text"}
            )
            continue
        h = _sha256(text_content)

        ins = db.execute(
            text(
                """
          INSERT INTO rag_documents (source, url, title, vendor, etag, last_modified, content_hash, status)
          VALUES ('file', NULL, :title, :vendor, NULL, NULL, :h, 'ok')
          RETURNING id
        """
            ),
            {"title": f["filename"], "vendor": vendor, "h": h},
        )
        doc_id = ins.fetchone()[0]

        chunks = chunk_text(text_content)
        embeddings = await embed_texts(chunks)
        for idx, (content, emb) in enumerate(zip(chunks, embeddings)):
            meta = {"file": f["filename"], "vendor": vendor, "chunk_idx": idx}
            if is_pg:
                db.execute(
                    text(
                        """
                  INSERT INTO rag_chunks (doc_id, chunk_idx, content, meta_json, embedding, embedding_vec)
                  VALUES (:d, :i, :c, :m, :b, CAST(:vec AS vector))
                """
                    ),
                    {
                        "d": doc_id,
                        "i": idx,
                        "c": content,
                        "m": json.dumps(meta),
                        "b": memoryview(b""),
                        "vec": _vec_str(emb),
                    },
                )
            else:
                db.execute(
                    text(
                        """
                  INSERT INTO rag_chunks (doc_id, chunk_idx, content, meta_json, embedding)
                  VALUES (:d, :i, :c, :m, :b)
                """
                    ),
                    {
                        "d": doc_id,
                        "i": idx,
                        "c": content,
                        "m": json.dumps(meta),
                        "b": memoryview(bytes()),
                    },
                )
        db.commit()
        results.append(
            {"file": f["filename"], "status": "ingested", "chunks": len(chunks)}
        )
    return {"ok": True, "results": results}
