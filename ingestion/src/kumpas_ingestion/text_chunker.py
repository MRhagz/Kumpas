import re
from dataclasses import dataclass

_SENTENCE_BOUNDARY = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9])")


@dataclass(frozen=True)
class ChunkConfig:
    chunk_size: int = 800
    overlap: int = 100


def chunk_text(text: str, config: ChunkConfig | None = None) -> list[str]:
    """Split text into overlapping chunks with sentence-aware boundaries.

    Used by PSA, DOLE BLE, CHED, and TESDA pipelines so that vector-store records
    have consistent granularity across all silos.
    """
    cfg = config or ChunkConfig()
    if cfg.overlap >= cfg.chunk_size:
        raise ValueError("overlap must be smaller than chunk_size")

    cleaned = " ".join(text.split())
    if not cleaned:
        return []
    if len(cleaned) <= cfg.chunk_size:
        return [cleaned]

    chunks: list[str] = []
    cursor = 0
    while cursor < len(cleaned):
        window_end = min(cursor + cfg.chunk_size, len(cleaned))
        window = cleaned[cursor:window_end]

        if window_end < len(cleaned):
            split_at = _last_sentence_boundary(window)
            if split_at > cfg.chunk_size // 2:
                window = window[:split_at].rstrip()
                window_end = cursor + split_at

        chunks.append(window.strip())
        if window_end >= len(cleaned):
            break
        cursor = max(window_end - cfg.overlap, cursor + 1)

    return [c for c in chunks if c]


def _last_sentence_boundary(window: str) -> int:
    last = 0
    for match in _SENTENCE_BOUNDARY.finditer(window):
        last = match.start() + 1
    return last
