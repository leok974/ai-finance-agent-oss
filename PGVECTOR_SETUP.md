# pgvector Implementation Summary

## ✅ Completed Setup

### 1. Dependencies
- ✅ Added `pgvector==0.2.*` to `requirements.txt`
- ✅ Existing `pgvector/pgvector:pg16` Docker image in `docker-compose.e2e.yml`

### 2. Database Extension
- ✅ Migration creates extension: `CREATE EXTENSION IF NOT EXISTS vector`
- ✅ Migration in `alembic/versions/20251005_rag_pgvector.py`
- ✅ Idempotent (safe to run multiple times)

### 3. Models (`app/orm_models.py`)
- ✅ `RagDocument` - Document metadata with relationships
- ✅ `RagChunk` - Content chunks with vector embeddings
- ✅ Graceful fallback for SQLite (unit tests)
- ✅ Configurable `EMBED_DIM` from environment

### 4. Vector Column & Indexes
- ✅ Column: `rag_chunks.embedding_vec vector(EMBED_DIM)`
- ✅ Index: HNSW with cosine distance (`vector_cosine_ops`)
- ✅ Parameters: `m=16, ef_construction=64`
- ✅ Conditional creation (Postgres only)

### 5. Repository Layer (`app/repositories/rag_repository.py`)
- ✅ Dialect-aware (Postgres vs SQLite)
- ✅ `search_similar()` - KNN semantic search
- ✅ CRUD operations for documents and chunks
- ✅ Vendor filtering and distance thresholds

### 6. Documentation
- ✅ Comprehensive guide: `apps/backend/docs/PGVECTOR_GUIDE.md`
- ✅ Query examples with cosine distance (`<=>`)
- ✅ Performance tuning tips
- ✅ E2E testing strategies
- ✅ Troubleshooting checklist

## Configuration

### Environment Variables

```bash
# Set embedding dimension (must match your model)
export EMBED_DIM=1536  # OpenAI text-embedding-3-small (default)
# export EMBED_DIM=3072  # OpenAI text-embedding-3-large
# export EMBED_DIM=768   # nomic-embed-text

# E2E Database
export DATABASE_URL=postgresql+psycopg://app:app@127.0.0.1:5432/app_e2e
```

## Quick Start

### 1. Install Dependencies

```bash
cd apps/backend
pip install -r requirements.txt
```

### 2. Run Migrations

```bash
# Extension and tables created automatically
python -m alembic upgrade head
```

### 3. Use in Code

```python
from app.repositories.rag_repository import get_rag_repo
from app.db import get_db

# Get repository
db = next(get_db())
rag_repo = get_rag_repo(db)

# Create document
doc = rag_repo.create_document(
    source="url",
    url="https://example.com/docs",
    title="API Docs",
    content_hash="abc123",
)

# Add chunk with embedding
chunk = rag_repo.create_chunk(
    doc_id=doc.id,
    chunk_idx=0,
    content="This is the content...",
    embedding=[0.1, 0.2, ..., 0.3],  # 1536 floats
)

# Search similar content
results = rag_repo.search_similar(
    query_embedding=[0.1, 0.2, ..., 0.3],
    k=10,
    vendor="internal",  # optional filter
)

for result in results:
    print(f"{result['title']}: {result['content'][:100]}... (distance: {result['distance']:.4f})")
```

## KNN Query Examples

### Basic Search

```python
# Find top 10 most similar chunks
results = rag_repo.search_similar(
    query_embedding=query_vec,
    k=10,
)
```

### With Vendor Filter

```python
# Search only Spotify documentation
results = rag_repo.search_similar(
    query_embedding=query_vec,
    k=10,
    vendor="spotify",
)
```

### With Distance Threshold

```python
# Only return results within distance 0.3
results = rag_repo.search_similar(
    query_embedding=query_vec,
    k=10,
    min_distance=0.3,
)
```

### Raw SQL (for advanced use)

```python
from sqlalchemy import text

results = db.execute(
    text("""
        SELECT
            c.id,
            c.content,
            d.title,
            c.embedding_vec <=> :query AS distance
        FROM rag_chunks c
        JOIN rag_documents d ON c.doc_id = d.id
        WHERE d.vendor = :vendor
        ORDER BY c.embedding_vec <=> :query
        LIMIT :k
    """),
    {"query": query_vec, "vendor": "spotify", "k": 10}
).fetchall()
```

## E2E Testing

### Database Setup

```bash
# 1. Start Postgres with pgvector
docker compose -f docker-compose.e2e.yml up -d db

# 2. Run migrations (creates extension + tables + indexes)
cd apps/backend
python -m alembic upgrade head

# 3. Reset database (preserves extension/indexes)
python scripts/e2e_db_reset.py

# 4. Seed test data (if needed)
python -m app.cli_seed_dev_user test@example.com password123
```

### Run E2E Tests

```bash
# Using automated script (Windows)
pwsh -File scripts/e2e.ps1

# Using automated script (Unix)
bash scripts/e2e.sh

# Using Make
make e2e
```

## Verification

### Check Extension

```bash
docker compose -f docker-compose.e2e.yml exec db psql -U app -d app_e2e -c "SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';"
```

Expected:
```
 extname | extversion
---------+------------
 vector  | 0.5.1
```

### Check Tables

```bash
docker compose -f docker-compose.e2e.yml exec db psql -U app -d app_e2e -c "\d+ rag_chunks"
```

Look for:
```
embedding_vec | vector(1536) | ...
```

### Check Indexes

```bash
docker compose -f docker-compose.e2e.yml exec db psql -U app -d app_e2e -c "SELECT indexname FROM pg_indexes WHERE tablename = 'rag_chunks';"
```

Expected:
```
              indexname
-------------------------------------
 rag_chunks_pkey
 ix_rag_chunks_doc_id
 ix_rag_chunks_doc_id_chunk_idx
 ix_rag_chunks_embedding_hnsw
```

## Performance Tuning

### After Bulk Inserts

```sql
-- Update table statistics
ANALYZE rag_chunks;
```

### Query Performance Check

```sql
EXPLAIN ANALYZE
SELECT c.id, c.content, c.embedding_vec <=> '[...]'::vector AS dist
FROM rag_chunks c
ORDER BY dist
LIMIT 10;
```

Look for: `Index Scan using ix_rag_chunks_embedding_hnsw`

### Adjust Search Depth (Runtime)

```sql
-- Higher ef_search = better recall, slower query
SET hnsw.ef_search = 200;
```

## Troubleshooting

### Error: "extension vector not found"

**Solution**: Use `pgvector/pgvector:pg16` image (already configured in `docker-compose.e2e.yml`)

### Error: "expected 1536 dimensions, not 768"

**Solution**: Ensure `EMBED_DIM` environment variable matches your embedding model

### Index Not Used (Seq Scan)

**Causes**:
1. Table too small (<1000 rows) - Postgres prefers seq scan (this is optimal!)
2. Statistics out of date - Run `ANALYZE rag_chunks`
3. Query planner override - Force with `SET enable_seqscan = off` (debugging only)

### Unit Tests Fail with "Vector type not found"

**Expected**: Unit tests run on SQLite. The model has graceful fallback.

**Solution**: Mock the repository layer in tests:

```python
from unittest.mock import MagicMock

def test_search(monkeypatch):
    mock_repo = MagicMock()
    mock_repo.search_similar.return_value = [...]
    monkeypatch.setattr("app.services.rag.rag_repo", mock_repo)
```

## Next Steps

1. **Implement Embedding Pipeline**: Add service to generate embeddings from documents
2. **Batch Ingestion**: Bulk insert chunks with COPY for better performance
3. **Incremental Updates**: Use ETags to avoid re-processing unchanged documents
4. **Monitoring**: Track search latency and index size
5. **Tune Parameters**: Adjust `m`, `ef_construction`, `ef_search` based on dataset size

## Resources

- Full guide: `apps/backend/docs/PGVECTOR_GUIDE.md`
- Repository: `apps/backend/app/repositories/rag_repository.py`
- Models: `apps/backend/app/orm_models.py` (search for "RAG Models")
- Migration: `apps/backend/alembic/versions/20251005_rag_pgvector.py`
