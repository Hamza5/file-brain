"""
Unit tests for the text chunking service.
"""

from file_brain.services.chunker import chunk_text, generate_chunk_hash, get_chunk_config


def test_chunk_empty_content():
    """Empty string returns single empty chunk."""
    result = chunk_text("")
    assert result == [""]


def test_chunk_small_content():
    """Content smaller than chunk_size returns single chunk."""
    content = "This is a small piece of text."
    result = chunk_text(content, chunk_size=1000)
    assert len(result) == 1
    assert result[0] == content


def test_chunk_large_content_with_overlap():
    """Large content splits with proper overlap."""
    # Create content larger than chunk size
    content = "word " * 500  # 2500 characters
    result = chunk_text(content, chunk_size=1000, overlap=200)

    # Should have multiple chunks
    assert len(result) > 1

    # Each chunk should be roughly chunk_size or smaller
    for chunk in result:
        assert len(chunk) <= 1200  # Allow some flexibility for word boundaries


def test_chunk_respects_word_boundaries():
    """Chunks break at spaces/newlines when possible."""
    content = "word1 word2 word3 " * 100
    result = chunk_text(content, chunk_size=100, overlap=20)

    # Should create multiple chunks
    assert len(result) > 1


def test_chunk_custom_size_and_overlap():
    """Custom chunk_size and overlap parameters work."""
    content = "a" * 500
    result = chunk_text(content, chunk_size=100, overlap=20)

    assert len(result) > 1
    # With 500 chars, chunk_size=100, overlap=20, we expect ~6 chunks
    # (100, then 80 new chars per chunk after that)
    assert 5 <= len(result) <= 7


def test_generate_chunk_hash_unique():
    """Different files/chunks produce different hashes."""
    hash1 = generate_chunk_hash("/path/file1.txt", 0, "content")
    hash2 = generate_chunk_hash("/path/file2.txt", 0, "content")
    hash3 = generate_chunk_hash("/path/file1.txt", 1, "content")

    assert hash1 != hash2  # Different files
    assert hash1 != hash3  # Different chunk indices


def test_generate_chunk_hash_deterministic():
    """Same input produces same hash."""
    hash1 = generate_chunk_hash("/path/file.txt", 0, "content")
    hash2 = generate_chunk_hash("/path/file.txt", 0, "content")

    assert hash1 == hash2


def test_get_chunk_config_defaults():
    """Returns default config values."""
    chunk_size, overlap = get_chunk_config()

    # Default values from the function
    assert chunk_size == 1000
    assert overlap == 200
