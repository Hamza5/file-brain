"""
Typesense collection schema definition
"""

import hashlib
import json
from typing import Any, Dict


def get_collection_schema(collection_name: str) -> Dict[str, Any]:
    """
    Get Typesense collection schema for chunk-based file indexing.

    All chunks contain complete metadata for simplified querying and filtering.
    This allows faceted search and filtering on any field without needing to
    filter by chunk_index.

    Args:
        collection_name: Name of the collection

    Returns:
        Collection schema dictionary
    """
    return {
        "name": collection_name,
        "fields": [
            # File identification
            {"name": "file_path", "type": "string", "facet": True},  # Must be facet for group_by
            # Chunk metadata
            {"name": "chunk_index", "type": "int32", "facet": False},
            {"name": "chunk_total", "type": "int32", "facet": False},
            {"name": "chunk_hash", "type": "string", "facet": False},
            # Essential metadata (needed for UI display)
            {"name": "file_extension", "type": "string", "facet": True},
            {"name": "file_size", "type": "int64", "facet": False},
            {"name": "mime_type", "type": "string", "facet": True},
            {"name": "modified_time", "type": "int64", "facet": False},
            # Content
            {"name": "content", "type": "string", "facet": False},
            # Additional metadata
            {"name": "file_hash", "type": "string", "facet": False},
            {"name": "created_time", "type": "int64", "facet": False},
            {"name": "indexed_at", "type": "int64", "facet": False},
            # Enhanced metadata from Tika extraction
            {"name": "title", "type": "string", "facet": False},
            {"name": "author", "type": "string", "facet": True},
            {"name": "description", "type": "string", "facet": False},
            {"name": "subject", "type": "string", "facet": True},
            {"name": "language", "type": "string", "facet": True},
            {"name": "producer", "type": "string", "facet": True},
            {"name": "application", "type": "string", "facet": True},
            {"name": "comments", "type": "string", "facet": False},
            {"name": "revision", "type": "string", "facet": False},
            # Date metadata from document content
            {
                "name": "document_created_date",
                "type": "string",
                "facet": False,
            },
            {
                "name": "document_modified_date",
                "type": "string",
                "facet": False,
            },
            # Keywords as array for faceted search
            {"name": "keywords", "type": "string[]", "facet": True},
            # Content type information
            {"name": "content_type", "type": "string", "facet": True},
            # Embedding for semantic search
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
