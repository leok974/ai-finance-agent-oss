"""
RAG Repository: Database operations for semantic search.

Handles dialect differences (Postgres with pgvector vs SQLite for tests).
"""

from sqlalchemy.orm import Session
from sqlalchemy import text
from app.orm_models import RagDocument, RagChunk
from typing import List, Dict, Any


def is_postgres(db: Session) -> bool:
    """Check if connected to Postgres (vs SQLite)."""
    return db.bind.dialect.name.startswith("postgres")  # type: ignore


class RagRepository:
    """Repository for RAG document and chunk operations."""

    def __init__(self, db: Session):
        self.db = db
        self._is_postgres = is_postgres(db)

    def create_document(
        self,
        source: str,
        url: str | None = None,
        title: str | None = None,
        vendor: str | None = None,
        content_hash: str = "",
        status: str = "ok",
    ) -> RagDocument:
        """Create a new document."""
        doc = RagDocument(
            source=source,
            url=url,
            title=title,
            vendor=vendor,
            content_hash=content_hash,
            status=status,
        )
        self.db.add(doc)
        self.db.flush()
        return doc

    def create_chunk(
        self,
        doc_id: int,
        chunk_idx: int,
        content: str,
        embedding: List[float],
        meta_json: str | None = None,
    ) -> RagChunk:
        """Create a new chunk with embedding."""
        chunk = RagChunk(
            doc_id=doc_id,
            chunk_idx=chunk_idx,
            content=content,
            meta_json=meta_json,
        )

        # Set embedding based on dialect
        if self._is_postgres:
            chunk.embedding_vec = embedding  # type: ignore
        else:
            # SQLite: store as bytes (for testing/fallback)
            import struct

            chunk.embedding = struct.pack(f"{len(embedding)}f", *embedding)

        self.db.add(chunk)
        self.db.flush()
        return chunk

    def search_similar(
        self,
        query_embedding: List[float],
        k: int = 10,
        vendor: str | None = None,
        min_distance: float | None = None,
    ) -> List[Dict[str, Any]]:
        """
        Search for similar chunks using vector similarity.

        Args:
            query_embedding: Query vector (must match EMBED_DIM)
            k: Number of results to return
            vendor: Filter by document vendor (optional)
            min_distance: Maximum distance threshold (optional)

        Returns:
            List of dicts with keys: id, content, doc_id, title, url, vendor, distance
        """
        if not self._is_postgres:
            # Fallback for SQLite (no vector search)
            # Return recent chunks for testing
            results = (
                self.db.query(
                    RagChunk.id,
                    RagChunk.content,
                    RagChunk.doc_id,
                    RagDocument.title,
                    RagDocument.url,
                    RagDocument.vendor,
                )
                .join(RagDocument)
                .filter(RagDocument.status == "ok")
                .limit(k)
                .all()
            )

            return [
                {
                    "id": r.id,
                    "content": r.content,
                    "doc_id": r.doc_id,
                    "title": r.title,
                    "url": r.url,
                    "vendor": r.vendor,
                    "distance": 0.0,  # Placeholder
                }
                for r in results
            ]

        # Postgres: use vector similarity search
        vendor_filter = ""
        if vendor:
            vendor_filter = "AND d.vendor = :vendor"

        distance_filter = ""
        if min_distance is not None:
            distance_filter = "AND (c.embedding_vec <=> :query_vec) <= :min_distance"

        query = text(
            f"""
            SELECT
                c.id,
                c.content,
                c.doc_id,
                d.title,
                d.url,
                d.vendor,
                c.embedding_vec <=> :query_vec AS distance
            FROM rag_chunks c
            JOIN rag_documents d ON c.doc_id = d.id
            WHERE d.status = 'ok'
            {vendor_filter}
            {distance_filter}
            ORDER BY c.embedding_vec <=> :query_vec
            LIMIT :k
        """
        )

        params = {"query_vec": query_embedding, "k": k}
        if vendor:
            params["vendor"] = vendor
        if min_distance is not None:
            params["min_distance"] = min_distance

        results = self.db.execute(query, params).fetchall()

        return [
            {
                "id": r.id,
                "content": r.content,
                "doc_id": r.doc_id,
                "title": r.title,
                "url": r.url,
                "vendor": r.vendor,
                "distance": float(r.distance),
            }
            for r in results
        ]

    def get_document_by_url(self, url: str) -> RagDocument | None:
        """Get document by URL."""
        return self.db.query(RagDocument).filter(RagDocument.url == url).first()

    def get_chunks_by_document(self, doc_id: int) -> List[RagChunk]:
        """Get all chunks for a document."""
        return (
            self.db.query(RagChunk)
            .filter(RagChunk.doc_id == doc_id)
            .order_by(RagChunk.chunk_idx)
            .all()
        )

    def delete_document(self, doc_id: int) -> None:
        """Delete document and all its chunks (cascade)."""
        doc = self.db.query(RagDocument).filter(RagDocument.id == doc_id).first()
        if doc:
            self.db.delete(doc)
            self.db.flush()

    def count_documents(self, vendor: str | None = None) -> int:
        """Count documents, optionally filtered by vendor."""
        query = self.db.query(RagDocument)
        if vendor:
            query = query.filter(RagDocument.vendor == vendor)
        return query.count()

    def count_chunks(self) -> int:
        """Count total chunks."""
        return self.db.query(RagChunk).count()


def get_rag_repo(db: Session) -> RagRepository:
    """Factory function for dependency injection."""
    return RagRepository(db)
