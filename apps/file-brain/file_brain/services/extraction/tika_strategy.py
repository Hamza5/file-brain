"""
Tika Extraction Strategy

Extracts content from documents using Apache Tika.
"""

from typing import Any, Dict, Optional

from file_brain.api.models.file_event import DocumentContent
from file_brain.core.config import settings
from file_brain.core.logging import logger
from file_brain.services.extraction.protocol import ExtractionStrategy


class TikaExtractionStrategy:
    """Strategy for extracting content using Apache Tika."""

    def __init__(self, tika_endpoint: Optional[str] = None):
        self.tika_endpoint = tika_endpoint

    def can_extract(self, file_path: str) -> bool:
        """Check if Tika extraction is enabled and available."""
        return settings.tika_enabled

    def extract(self, file_path: str) -> DocumentContent:
        """Extract content using Tika."""
        from tika import parser

        logger.info(f"Extracting with Tika: {file_path}")

        if self.tika_endpoint:
            logger.debug(f"Using Tika endpoint: {self.tika_endpoint}")
            parsed = parser.from_file(file_path, self.tika_endpoint)
        else:
            parsed = parser.from_file(file_path)

        if not parsed or "content" not in parsed:
            raise ValueError(f"Tika returned empty result for {file_path}")

        content = parsed.get("content")
        if content is None:
            content = ""

        content = content.strip()
        if not content:
            raise ValueError(f"Tika extracted empty content for {file_path}")

        raw_metadata = parsed.get("metadata", {})
        metadata = self._process_metadata(raw_metadata)

        if self.tika_endpoint:
            metadata["tika_endpoint"] = self.tika_endpoint

        logger.info(f"Successfully extracted {len(content)} characters from {file_path}")
        return DocumentContent(content=content, metadata=metadata)

    def _process_metadata(self, raw_metadata: Dict[str, Any]) -> Dict[str, Any]:
        """Process Tika metadata to extract useful fields."""
        metadata: Dict[str, Any] = {}

        mappings = {
            "Content-Type": "mime_type",
            "dc:title": "title",
            "title": "title",
            "dc:creator": "author",
            "Author": "author",
            "creator": "author",
            "dc:description": "description",
            "description": "description",
            "Last-Modified": "modified_date",
            "Creation-Date": "created_date",
            "xmpTPg:NPages": "page_count",
            "Page-Count": "page_count",
            "meta:word-count": "word_count",
            "Word-Count": "word_count",
            "meta:character-count": "character_count",
            "Character-Count": "character_count",
        }

        for tika_key, our_key in mappings.items():
            if tika_key in raw_metadata and our_key not in metadata:
                value = raw_metadata[tika_key]
                if isinstance(value, list):
                    value = value[0] if value else None
                if value:
                    metadata[our_key] = value

        metadata["extraction_method"] = "tika"
        return metadata


# Verify protocol compliance
_: ExtractionStrategy = TikaExtractionStrategy()  # type: ignore[assignment]
