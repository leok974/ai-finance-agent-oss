"""NVIDIA NIM Embedding client adapter."""

import os
import httpx
import math
import time
import logging
from typing import List

logger = logging.getLogger(__name__)


class NimEmbedClient:
    """NVIDIA NIM Embedding client using OpenAI-compatible embeddings API."""

    def __init__(self):
        self.base_url = os.getenv("NIM_EMBED_URL", "").rstrip("/")
        self.api_key = os.getenv("NIM_API_KEY", "") or os.getenv("NGC_API_KEY", "")
        self.model = os.getenv("NIM_EMBED_MODEL", "nvidia/nv-embed-v2")
        self.timeout = int(os.getenv("NIM_TIMEOUT_SEC", "30"))
        self.batch_size = int(os.getenv("EMBED_BATCH_SIZE", "16"))

        if not self.base_url:
            raise ValueError("NIM_EMBED_URL not set")
        if not self.api_key:
            raise ValueError("NIM_API_KEY or NGC_API_KEY not set")
        if not self.api_key.startswith("nvapi-"):
            logger.warning(
                f"NIM_API_KEY format unexpected (should start with 'nvapi-'), got: {self.api_key[:10]}..."
            )

    async def embed_texts(
        self, texts: List[str], input_type: str = "passage"
    ) -> List[List[float]]:
        """
        Generate embeddings for a batch of texts with retry logic.
        Args:
            texts: List of texts to embed
            input_type: Either "passage" (for documents) or "query" (for search queries)
                       Required for asymmetric models like nv-embedqa-e5-v5
        Returns: List of normalized embedding vectors.
        """
        if not texts:
            return []

        # Process in batches to avoid overwhelming the API
        all_embeddings = []
        for i in range(0, len(texts), self.batch_size):
            batch = texts[i : i + self.batch_size]
            batch_embeddings = await self._embed_batch_with_retry(batch, input_type)
            all_embeddings.extend(batch_embeddings)

        return all_embeddings

    async def _embed_batch_with_retry(
        self, texts: List[str], input_type: str, max_retries: int = 3
    ) -> List[List[float]]:
        """Embed a batch with exponential backoff retry on 429."""
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {"model": self.model, "input": texts, "input_type": input_type}

        for attempt in range(max_retries):
            try:
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    resp = await client.post(
                        f"{self.base_url}/embeddings", headers=headers, json=payload
                    )

                    # Handle rate limiting with exponential backoff
                    if resp.status_code == 429:
                        if attempt < max_retries - 1:
                            backoff = min(2**attempt, 8)  # max 8 seconds
                            logger.warning(
                                f"Rate limited (429), retrying in {backoff}s (attempt {attempt + 1}/{max_retries})"
                            )
                            time.sleep(backoff)
                            continue
                        else:
                            logger.error("Rate limit exceeded after max retries")
                            resp.raise_for_status()

                    resp.raise_for_status()
                    data = resp.json()
                    embeddings = [
                        self._normalize(item["embedding"]) for item in data["data"]
                    ]
                    return embeddings

            except httpx.TimeoutException as e:
                logger.error(
                    f"Timeout embedding batch (attempt {attempt + 1}/{max_retries}): {e}"
                )
                if attempt == max_retries - 1:
                    raise
            except Exception as e:
                logger.error(
                    f"Error embedding batch (attempt {attempt + 1}/{max_retries}): {e}"
                )
                if attempt == max_retries - 1:
                    raise

        return []  # Should not reach here

    def _normalize(self, vec: List[float]) -> List[float]:
        """Normalize vector to unit length for cosine similarity, with safety guards."""
        if not vec:
            return []

        norm = math.sqrt(sum(x * x for x in vec)) or 1.0
        normalized = [x / norm for x in vec]

        # Clamp values to [-1, 1] for numerical stability
        return [max(-1.0, min(1.0, x)) for x in normalized]
