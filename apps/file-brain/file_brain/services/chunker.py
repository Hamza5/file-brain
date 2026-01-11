"""
Text chunking service for splitting content into overlapping chunks.
"""

import hashlib
from typing import List


def chunk_text(content: str, chunk_size: int = 1000, overlap: int = 200) -> List[str]:
    """
    Split text content into overlapping chunks.

    Args:
        content: Text content to chunk
        chunk_size: Maximum size of each chunk in characters
        overlap: Number of overlapping characters between chunks

    Returns:
        List of text chunks
    """
    if not content:
        return [""]

    # If content is smaller than chunk size, return as single chunk
    if len(content) <= chunk_size:
        return [content]

    chunks = []
    start = 0

    while start < len(content):
        # Calculate end position for this chunk
        end = start + chunk_size

        # If this isn't the last chunk, try to find a word boundary
        if end < len(content):
            # Look for word boundary (space, newline, punctuation) near the end
            boundary_search_start = max(start + chunk_size - 100, start)
            boundary_search_end = min(end + 100, len(content))

            # Find last space or newline in the search range
            last_space = content.rfind(" ", boundary_search_start, boundary_search_end)
            last_newline = content.rfind("\n", boundary_search_start, boundary_search_end)

            # Use the boundary that's closest to our target end position
            boundary = max(last_space, last_newline)
            if boundary > start:
                end = boundary + 1  # Include the space/newline in previous chunk

        # Extract chunk
        chunk = content[start:end].strip()
        if chunk:  # Only add non-empty chunks
            chunks.append(chunk)

        # Move start position for next chunk (with overlap)
        start = end - overlap if end < len(content) else len(content)

    return chunks


def generate_chunk_hash(file_path: str, chunk_index: int, content: str) -> str:
    """
    Generate a unique hash for a chunk.

    Args:
        file_path: Path to the file
        chunk_index: Index of the chunk
        content: Content of the chunk

    Returns:
        SHA1 hash of the chunk identifier
    """
    identifier = f"{file_path}:{chunk_index}:{content[:100]}"
    return hashlib.sha1(identifier.encode()).hexdigest()


def get_chunk_config() -> tuple[int, int]:
    """
    Get chunking configuration from environment variables.

    Returns:
        Tuple of (chunk_size, overlap)

    Defaults:
        CHUNK_SIZE: 1000 characters
        CHUNK_OVERLAP: 200 characters
    """
    from os import getenv

    chunk_size = int(getenv("CHUNK_SIZE", "1000"))
    overlap = int(getenv("CHUNK_OVERLAP", "200"))
    return chunk_size, overlap
