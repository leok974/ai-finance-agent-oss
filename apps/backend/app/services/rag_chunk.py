import re
from bs4 import BeautifulSoup


def html_to_text(html: str) -> str:
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()
    text = soup.get_text("\n")
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def chunk_text(text: str, max_tokens: int = 800, overlap: int = 100) -> list[str]:
    # simple char-based fallback approximating tokens (~4 chars/token)
    approx = int(max_tokens * 4)
    ov = int(overlap * 4)
    chunks: list[str] = []
    i = 0
    N = len(text)
    while i < N:
        chunk = text[i : i + approx]
        # try to cut at paragraph boundary
        cut = chunk.rfind("\n\n")
        if cut > int(approx * 0.6):
            chunk = chunk[:cut]
        chunk = chunk.strip()
        if chunk:
            chunks.append(chunk)
        i += max(1, len(chunk) - ov)
    return chunks
