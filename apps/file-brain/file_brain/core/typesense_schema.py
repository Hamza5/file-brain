"""
Typesense collection schema definition
"""

import hashlib
import json
from typing import Any, Dict


def get_collection_schema(collection_name: str) -> Dict[str, Any]:
    """
    Get Typesense collection schema for chunk-based file indexing.

    Note: Metadata (extension, size, dates, etc.) is stored only in chunk_index=0
    to minimize storage. Other chunks contain only file_path, content, and chunk fields.

    Args:
        collection_name: Name of the collection

    Returns:
        Collection schema dictionary
    """
    return {
        "name": collection_name,
        "fields": [
            # File identification (required for all chunks)
            {"name": "file_path", "type": "string", "facet": True},  # Must be facet for group_by
            # Chunk metadata (required for all chunks)
            {"name": "chunk_index", "type": "int32", "facet": False},
            {"name": "chunk_total", "type": "int32", "facet": False},
            {"name": "chunk_hash", "type": "string", "facet": False},
            # Essential metadata (required for all chunks - needed for UI display)
            {"name": "file_extension", "type": "string", "facet": True},
            {"name": "file_size", "type": "int64", "facet": False},
            {"name": "mime_type", "type": "string", "facet": True},
            {"name": "modified_time", "type": "int64", "facet": False},
            # Content (required for all chunks)
            {"name": "content", "type": "string", "facet": False},
            # Additional metadata (optional - only in chunk 0)
            {"name": "file_hash", "type": "string", "optional": True, "facet": False},
            {"name": "created_time", "type": "int64", "facet": False, "optional": True},
            {"name": "indexed_at", "type": "int64", "facet": False, "optional": True},
            # Enhanced metadata from Tika extraction (optional - only in chunk 0)
            {"name": "title", "type": "string", "facet": False, "optional": True},
            {"name": "author", "type": "string", "facet": True, "optional": True},
            {"name": "description", "type": "string", "facet": False, "optional": True},
            {"name": "subject", "type": "string", "facet": True, "optional": True},
            {"name": "language", "type": "string", "facet": True, "optional": True},
            {"name": "producer", "type": "string", "facet": True, "optional": True},
            {"name": "application", "type": "string", "facet": True, "optional": True},
            {"name": "comments", "type": "string", "facet": False, "optional": True},
            {"name": "revision", "type": "string", "facet": False, "optional": True},
            # Date metadata from document content (optional - only in chunk 0)
            {
                "name": "document_created_date",
                "type": "string",
                "facet": False,
                "optional": True,
            },
            {
                "name": "document_modified_date",
                "type": "string",
                "facet": False,
                "optional": True,
            },
            # Keywords as array for faceted search (optional - only in chunk 0)
            {"name": "keywords", "type": "string[]", "facet": True, "optional": True},
            # Content type information (optional - only in chunk 0)
            {"name": "content_type", "type": "string", "facet": True, "optional": True},
            # Embedding for semantic search (required for all chunks)
            {
                "name": "embedding",
                "type": "float[]",
                "embed": {
                    "from": [
                        "title",
                        "description",
                        "subject",
                        "keywords",
                        "author",
                        "content",
                    ],
                    "model_config": {"model_name": "ts/paraphrase-multilingual-mpnet-base-v2"},
                },
            },
        ],
        "default_sorting_field": "chunk_index",
    }


def get_schema_version() -> str:
    """
    Get a hash of the current schema definition.

    This version changes whenever schema fields or configuration change,
    allowing detection of schema updates that require collection recreation.

    Returns:
        16-character hex string representing schema version
    """
    # Get schema without collection name (not relevant for versioning)
    schema = get_collection_schema("dummy")
    del schema["name"]

    # Create deterministic JSON string and hash it
    schema_str = json.dumps(schema, sort_keys=True)
    return hashlib.sha256(schema_str.encode()).hexdigest()[:16]
