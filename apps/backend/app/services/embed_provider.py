import os
import httpx
from typing import List, Literal

ProviderName = Literal["openai", "ollama", "nim"]
EMBED_PROVIDER: ProviderName = os.getenv("EMBED_PROVIDER", "ollama")  # default local
OPENAI_MODEL = os.getenv("OPENAI_EMBED_MODEL", "text-embedding-3-small")
OLLAMA_MODEL = os.getenv("OLLAMA_EMBED_MODEL", "nomic-embed-text")
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://ollama:11434")
EMBED_DIM = int(os.getenv("EMBED_DIM", os.getenv("EMBEDDING_DIM", "768")))

# Production-safe feature flags for asymmetric embedding models
EMBED_INPUT_TYPE_QUERY = os.getenv("EMBED_INPUT_TYPE_QUERY", "query")
EMBED_INPUT_TYPE_PASSAGE = os.getenv("EMBED_INPUT_TYPE_PASSAGE", "passage")
NIM_TIMEOUT_SEC = int(os.getenv("NIM_TIMEOUT_SEC", "30"))
EMBED_BATCH_SIZE = int(os.getenv("EMBED_BATCH_SIZE", "16"))


def _normalize(vec: List[float]) -> List[float]:
    import math

    n = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / n for v in vec]


async def embed_texts(
    texts: List[str], input_type: str = "passage"
) -> List[List[float]]:
    """
    Generate embeddings for texts.
    Args:
        texts: List of texts to embed
        input_type: Either "passage" (for documents) or "query" (for search queries).
                   Only used by NIM provider with asymmetric models.
    """
    if not texts:
        return []

    # NIM provider support
    if EMBED_PROVIDER == "nim":
        from app.providers.nim_embed import NimEmbedClient

        client = NimEmbedClient()
        return await client.embed_texts(texts, input_type=input_type)

    if EMBED_PROVIDER == "openai":
        key = os.environ.get("OPENAI_API_KEY")
        if not key:
            raise RuntimeError("OPENAI_API_KEY not set for embed provider 'openai'")
        async with httpx.AsyncClient(timeout=60) as client:
            r = await client.post(
                "https://api.openai.com/v1/embeddings",
                headers={"Authorization": f"Bearer {key}"},
                json={"model": OPENAI_MODEL, "input": texts},
            )
            r.raise_for_status()
            data = r.json()
            emb = [_normalize(d["embedding"]) for d in data["data"]]
            # Optional sanity: store dimension into env for migrations downstream (non-persistent)
            os.environ.setdefault("EMBED_DIM", str(len(emb[0]) if emb else EMBED_DIM))
            return emb
    else:
        # ollama embeddings
        out: List[List[float]] = []
        async with httpx.AsyncClient(timeout=60) as client:
            for t in texts:
                r = await client.post(
                    f"{OLLAMA_URL}/api/embeddings",
                    json={"model": OLLAMA_MODEL, "prompt": t},
                )
                r.raise_for_status()
                vec = _normalize(r.json()["embedding"])
                out.append(vec)
        # Optional sanity: push dim to env for later processes (same process only)
        if out:
            os.environ.setdefault("EMBED_DIM", str(len(out[0])))
        return out
