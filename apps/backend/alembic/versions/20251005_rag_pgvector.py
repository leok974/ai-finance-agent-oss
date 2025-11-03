"""RAG pgvector tables and indexes

Revision ID: 20251005_rag_pgvector
Revises: 20251004_categorize_suggest
Create Date: 2025-10-05
"""

from alembic import op
import sqlalchemy as sa
import os

# revision identifiers, used by Alembic.
revision = "20251005_rag_pgvector"
down_revision = "20251004_categorize_suggest"
branch_labels = None
depends_on = None


def _is_postgres():
    try:
        bind = op.get_bind()
        return (getattr(bind.dialect, "name", None) or "").startswith("postgres")
    except Exception:
        return False


def upgrade():
    pg = _is_postgres()

    if pg:
        # pgvector extension (no-op if exists)
        op.execute("CREATE EXTENSION IF NOT EXISTS vector;")

    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    # documents table (one row per URL/file)
    if "rag_documents" not in existing_tables:
        op.create_table(
            "rag_documents",
            sa.Column("id", sa.Integer, primary_key=True),
            sa.Column("source", sa.String(16), nullable=False),  # url|file
            sa.Column("url", sa.Text, nullable=True),
            sa.Column("title", sa.Text, nullable=True),
            sa.Column(
                "vendor", sa.String(128), nullable=True
            ),  # parsed like 'spotify', 'netflix'
            sa.Column("etag", sa.String(256), nullable=True),
            sa.Column("last_modified", sa.String(128), nullable=True),
            sa.Column(
                "fetched_at",
                sa.DateTime,
                server_default=sa.text("CURRENT_TIMESTAMP"),
                nullable=False,
            ),
            sa.Column("content_hash", sa.String(64), nullable=False),
            sa.Column(
                "status", sa.String(16), nullable=False, server_default="ok"
            ),  # ok|skipped|error
            sa.Column("error", sa.Text, nullable=True),
            sa.UniqueConstraint("url", name="uq_rag_documents_url"),
        )

    # chunks table; keep raw embedding bytes flexible (provider/dim swap without migration)
    # Use BYTEA for Postgres; fallback to LargeBinary for other dialects
    emb_type = sa.LargeBinary if not pg else sa.dialects.postgresql.BYTEA
    if "rag_chunks" not in existing_tables:
        op.create_table(
            "rag_chunks",
            sa.Column("id", sa.Integer, primary_key=True),
            sa.Column(
                "doc_id",
                sa.Integer,
                sa.ForeignKey("rag_documents.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("chunk_idx", sa.Integer, nullable=False),
            sa.Column("content", sa.Text, nullable=False),
            sa.Column("meta_json", sa.Text, nullable=True),
            # Note: SQLite requires a concrete literal for DEFAULT; sa.text("") produces
            # 'DEFAULT  NOT NULL' which is invalid SQL. Use x'' (empty blob) on SQLite.
            # Keep Postgres default as empty string for BYTEA which is valid.
            sa.Column(
                "embedding",
                emb_type,
                nullable=False,
                server_default=sa.text("''") if pg else sa.text("x''"),
            ),
        )
    # ensure index exists (idempotent)
    try:
        idx_names = {ix["name"] for ix in inspector.get_indexes("rag_chunks")}
    except Exception:
        idx_names = set()
    if "ix_rag_chunks_doc_id_chunk_idx" not in idx_names:
        op.create_index(
            "ix_rag_chunks_doc_id_chunk_idx",
            "rag_chunks",
            ["doc_id", "chunk_idx"],
            unique=True,
        )

    if pg:
        # Add vector column and HNSW index (Postgres only)
        # Choose dimension from env or default to 768 (nomic-embed-text)
        dim = int(os.environ.get("EMBED_DIM", os.environ.get("EMBEDDING_DIM", "768")))
        op.execute(
            f"""
            ALTER TABLE rag_chunks
            ADD COLUMN IF NOT EXISTS embedding_vec vector({dim});
            """
        )
        # Ensure the column has explicit dimensions (older runs may have created undimensioned vector)
        op.execute(
            f"""
            ALTER TABLE rag_chunks
            ALTER COLUMN embedding_vec TYPE vector({dim});
            """
        )
        op.execute(
            """
            DO $$
                        DECLARE
                            dim integer;
                        BEGIN
                            SELECT atttypmod INTO dim
                            FROM pg_attribute
                            WHERE attrelid = 'rag_chunks'::regclass AND attname = 'embedding_vec';
                            IF dim IS NULL OR dim <= 0 THEN
                                RAISE NOTICE 'embedding_vec has no dimensions; skipping HNSW index creation';
                            ELSE
                                BEGIN
                                    CREATE INDEX IF NOT EXISTS ix_rag_chunks_embedding_hnsw
                                    ON rag_chunks
                                    USING hnsw (embedding_vec vector_cosine_ops)
                                    WITH (m=16, ef_construction=64);
                                EXCEPTION WHEN others THEN
                                    RAISE NOTICE 'Skipping HNSW index creation: %', SQLERRM;
                                END;
                            END IF;
            END $$;
            """
        )


def downgrade():
    pg = _is_postgres()
    if pg:
        op.execute("DROP INDEX IF EXISTS ix_rag_chunks_embedding_hnsw;")
    op.drop_index("ix_rag_chunks_doc_id_chunk_idx", table_name="rag_chunks")
    op.drop_table("rag_chunks")
    op.drop_table("rag_documents")
    # Note: extension left installed intentionally
