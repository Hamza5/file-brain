"""
Typesense collection schema definition
"""

from typing import Dict, Any


def get_collection_schema(collection_name: str) -> Dict[str, Any]:
    """
    Get Typesense collection schema for file indexing

    Args:
        collection_name: Name of the collection

    Returns:
        Collection schema dictionary
    """
    return {
        "name": collection_name,
        "fields": [
            # File identification
            {"name": "file_path", "type": "string", "facet": False},
            {"name": "file_name", "type": "string", "facet": True},
            {"name": "file_extension", "type": "string", "facet": True},
            # File metadata
            {"name": "file_size", "type": "int64", "facet": False},
            {"name": "mime_type", "type": "string", "facet": True},
            {"name": "file_hash", "type": "string", "facet": False},
            # Content
            {"name": "content", "type": "string", "facet": False},
            # Timestamps
            {"name": "modified_time", "type": "int64", "facet": False},
            {"name": "created_time", "type": "int64", "facet": False},
            {"name": "indexed_at", "type": "int64", "facet": False},
            # Enhanced metadata from Tika extraction
            {"name": "title", "type": "string", "facet": False, "optional": True},
            {"name": "author", "type": "string", "facet": True, "optional": True},
            {"name": "description", "type": "string", "facet": False, "optional": True},
            {"name": "subject", "type": "string", "facet": True, "optional": True},
            {"name": "language", "type": "string", "facet": True, "optional": True},
            {"name": "producer", "type": "string", "facet": True, "optional": True},
            {"name": "application", "type": "string", "facet": True, "optional": True},
            {"name": "comments", "type": "string", "facet": False, "optional": True},
            {"name": "revision", "type": "string", "facet": False, "optional": True},
            # Date metadata from document content (not filesystem)
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
            # Keywords as array for faceted search
            {"name": "keywords", "type": "string[]", "facet": True, "optional": True},
            # Content type information
            {"name": "content_type", "type": "string", "facet": True, "optional": True},
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
                    "model_config": {
                        "model_name": "ts/paraphrase-multilingual-mpnet-base-v2"
                    },
                },
            },
        ],
        "default_sorting_field": "modified_time",
    }
