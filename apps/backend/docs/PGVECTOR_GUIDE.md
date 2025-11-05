# pgvector Integration Guide

This guide explains how to use pgvector for semantic search in the RAG (Retrieval-Augmented Generation) system.

## Overview

- **Tables**: `rag_documents` (metadata) and `rag_chunks` (content + embeddings)
- **Vector Column**: `rag_chunks.embedding_vec` (type: `vector(EMBED_DIM)`)
- **Indexes**: HNSW index on `embedding_vec` for fast similarity search
- **Metrics**: Cosine distance (`<=>`) for normalized embeddings

## Configuration

### 1. Embedding Dimensions

Set via environment variable to match your embedding model:

```bash
# OpenAI text-embedding-3-small (default)
export EMBED_DIM=1536

# OpenAI text-embedding-3-large
export EMBED_DIM=3072

# nomic-embed-text
export EMBED_DIM=768
```

**Important**: Keep consistent between ingestion and query!

### 2. Database Setup

The pgvector extension is created automatically by the migration:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

## Models

### RagDocument

Tracks document metadata (URLs, files, vendors):

```python
from app.orm_models import RagDocument

doc = RagDocument(
    source="url",
    url="https://example.com/docs/api",
    title="API Documentation",
    vendor="internal",
    content_hash="abc123...",
    status="ok"
)
```

### RagChunk

Stores content chunks with vector embeddings:

```python
from app.orm_models import RagChunk

chunk = RagChunk(
    doc_id=doc.id,
    chunk_idx=0,
    content="This is a sample paragraph...",
    embedding_vec=[0.123, -0.456, ...]  # 1536 floats for text-embedding-3-small
)
```

## Querying: K-Nearest Neighbors (KNN)

### Basic KNN Query

```python
from sqlalchemy import text
from app.db import get_db

def search_similar(query_embedding: list[float], k: int = 10):
    """Find top-k most similar chunks using cosine distance."""
    db = next(get_db())

    results = db.execute(
        text("""
            SELECT
                c.id,
                c.content,
                c.doc_id,
                d.title,
                d.url,
                c.embedding_vec <=> :query_vec AS distance
            FROM rag_chunks c
            JOIN rag_documents d ON c.doc_id = d.id
            WHERE d.status = 'ok'
            ORDER BY c.embedding_vec <=> :query_vec
            LIMIT :k
        """),
        {"query_vec": query_embedding, "k": k}
    ).fetchall()

    return results
```

### Distance Operators

- `<=>` - Cosine distance (use with `vector_cosine_ops`)
- `<->` - Euclidean (L2) distance (use with `vector_l2_ops`)
- `<#>` - Inner product (use with `vector_ip_ops`)

**Recommendation**: Use cosine distance (`<=>`) with normalized embeddings.

### With Filters

```python
def search_by_vendor(query_embedding: list[float], vendor: str, k: int = 10):
    """Search within specific vendor's documents."""
    results = db.execute(
        text("""
            SELECT c.id, c.content, c.embedding_vec <=> :query_vec AS distance
            FROM rag_chunks c
            JOIN rag_documents d ON c.doc_id = d.id
            WHERE d.vendor = :vendor AND d.status = 'ok'
            ORDER BY c.embedding_vec <=> :query_vec
            LIMIT :k
        """),
        {"query_vec": query_embedding, "vendor": vendor, "k": k}
    ).fetchall()
    return results
```

## Indexes

### Current Index (HNSW)

Created automatically by migration:

```sql
CREATE INDEX ix_rag_chunks_embedding_hnsw
ON rag_chunks
USING hnsw (embedding_vec vector_cosine_ops)
WITH (m=16, ef_construction=64);
```

**Parameters**:
- `m=16` - Max connections per layer (higher = better recall, more memory)
- `ef_construction=64` - Build-time search depth (higher = better index quality, slower build)

### Query-Time Tuning

Adjust search depth for better recall:

```sql
-- Increase search depth for better recall (slower)
SET hnsw.ef_search = 200;

-- Run your KNN query
SELECT ...;
```

### Alternative: IVFFLAT

For smaller datasets or lower memory footprint:

```sql
CREATE INDEX ix_rag_chunks_embedding_ivfflat
ON rag_chunks
USING ivfflat (embedding_vec vector_cosine_ops)
WITH (lists = 100);

-- After creating index
ANALYZE rag_chunks;
```

**Parameters**:
- `lists` - Number of inverted lists (typically √n where n = row count)

## Performance Tips

### 1. Index Analysis

After bulk inserts, analyze the table:

```sql
ANALYZE rag_chunks;
```

### 2. Check Index Usage

```sql
EXPLAIN ANALYZE
SELECT c.id, c.content
FROM rag_chunks c
ORDER BY c.embedding_vec <=> '[0.1, 0.2, ...]'::vector
LIMIT 10;
```

Look for:
- `Index Scan using ix_rag_chunks_embedding_hnsw` ✅ Good!
- `Seq Scan on rag_chunks` ❌ Index not used

### 3. Force Index Usage (Debugging)

```sql
-- Temporarily disable sequential scans
SET enable_seqscan = off;

-- Run your query
SELECT ...;

-- Re-enable
SET enable_seqscan = on;
```

**Note**: Postgres may prefer seq scan for small tables (<1000 rows). This is often optimal!

### 4. Vacuum and Statistics

```sql
-- Update statistics
VACUUM ANALYZE rag_chunks;

-- Check table stats
SELECT
    schemaname,
    tablename,
    n_live_tup,
    n_dead_tup,
    last_vacuum,
    last_analyze
FROM pg_stat_user_tables
WHERE tablename = 'rag_chunks';
```

## E2E Testing

### Database Reset

The E2E reset script (`e2e_db_reset.py`) truncates tables but preserves the extension:

```sql
TRUNCATE TABLE rag_chunks, rag_documents RESTART IDENTITY CASCADE;
-- Extension and indexes remain intact
```

### Test Data Seeding

```python
from app.orm_models import RagDocument, RagChunk
import numpy as np

def seed_test_docs(db):
    """Seed test documents with random embeddings."""
    doc = RagDocument(
        source="url",
        url="https://test.example.com",
        title="Test Doc",
        content_hash="test123",
        status="ok"
    )
    db.add(doc)
    db.flush()

    # Add chunks with random embeddings (for testing only!)
    for i in range(10):
        chunk = RagChunk(
            doc_id=doc.id,
            chunk_idx=i,
            content=f"Test chunk {i}",
            embedding_vec=np.random.randn(1536).tolist()  # Random for testing
        )
        db.add(chunk)

    db.commit()
```

## Troubleshooting

### Check Extension Installed

```sql
SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';
```

Expected output:
```
 extname | extversion
---------+------------
 vector  | 0.5.1
```

### Check Column Type

```sql
\d+ rag_chunks
```

Look for:
```
embedding_vec | vector(1536) | ...
```

### Dimension Mismatch Error

```
ERROR: expected 1536 dimensions, not 768
```

**Solution**: Ensure `EMBED_DIM` matches your embedding model output.

### Index Not Created

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'rag_chunks' AND indexname LIKE '%embedding%';
```

If empty, run:
```sql
CREATE INDEX ix_rag_chunks_embedding_hnsw
ON rag_chunks
USING hnsw (embedding_vec vector_cosine_ops)
WITH (m=16, ef_construction=64);
```

## Unit Tests (SQLite Compatibility)

Unit tests run on SQLite which doesn't support pgvector. The model includes graceful fallback:

```python
try:
    from pgvector.sqlalchemy import Vector
    PGVECTOR_AVAILABLE = True
except ImportError:
    class Vector:  # Stub for type checking
        def __init__(self, dim: int):
            self.dim = dim
    PGVECTOR_AVAILABLE = False
```

**Best Practice**: Mock the repository layer in unit tests rather than testing vector operations directly.

```python
# test_rag_service.py
from unittest.mock import MagicMock

def test_search(monkeypatch):
    mock_repo = MagicMock()
    mock_repo.search_similar.return_value = [
        {"id": 1, "content": "Test", "distance": 0.1}
    ]
    monkeypatch.setattr("app.services.rag_service.rag_repo", mock_repo)

    # Test your service logic...
```

## Production Checklist

- [ ] `EMBED_DIM` matches your embedding model
- [ ] Extension created: `CREATE EXTENSION IF NOT EXISTS vector`
- [ ] Migration applied with vector columns and indexes
- [ ] `ANALYZE rag_chunks` after bulk inserts
- [ ] Query uses index (check `EXPLAIN ANALYZE`)
- [ ] Backup strategy includes pgvector extension

## Resources

- [pgvector GitHub](https://github.com/pgvector/pgvector)
- [pgvector-python Docs](https://github.com/pgvector/pgvector-python)
- [Postgres Vector Index Types](https://github.com/pgvector/pgvector#indexing)
- [OpenAI Embeddings Guide](https://platform.openai.com/docs/guides/embeddings)
