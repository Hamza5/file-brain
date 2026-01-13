"""
Document content extraction using Apache Tika with comprehensive format support
including archive handling.

Uses Strategy pattern for pluggable extraction methods.
"""

import mimetypes
import os
from typing import List, Optional

from file_brain.api.models.file_event import DocumentContent
from file_brain.core.config import settings
from file_brain.core.logging import logger
from file_brain.services.extraction.protocol import ExtractionStrategy


class ContentExtractor:
    """
    Document content extractor using pluggable extraction strategies.

    Uses Strategy pattern to select appropriate extraction method:
    1. Tika extraction for documents, images, and archives
    2. Basic extraction as fallback
    """

    def __init__(self, strategies: List[ExtractionStrategy]):
        """Initialize the content extractor with extraction strategies."""
        self.strategies = strategies

    def extract(self, file_path: str) -> DocumentContent:
        """
        Extract content from file using the appropriate strategy.

        Args:
            file_path: Path to file

        Returns:
            DocumentContent with content and metadata

        Raises:
            FileNotFoundError: If file doesn't exist
            Exception: For extraction errors
        """
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"File not found: {file_path}")

        # Try each strategy in order
        last_error = None
        result = None

        for strategy in self.strategies:
            if strategy.can_extract(file_path):
                try:
                    result = strategy.extract(file_path)
                    break
                except Exception as e:
                    logger.warning(f"{strategy.__class__.__name__} failed for {file_path}: {e}")
                    last_error = e

        if not result:
            if last_error:
                logger.error(f"All extraction strategies failed for {file_path}")
                raise last_error
            return DocumentContent(
                content="",
                metadata={"error": "No extraction strategy available"},
            )

        # Centralized MIME type detection
        if not result.metadata.get("mime_type") or result.metadata["mime_type"] == "application/octet-stream":
            guessed_type, _ = mimetypes.guess_type(file_path)
            result.metadata["mime_type"] = guessed_type or "application/octet-stream"

        return result


# Global extractor instance
_extractor: Optional[ContentExtractor] = None


def get_extractor() -> ContentExtractor:
    """Get or create global extractor instance"""
    global _extractor
    if _extractor is None:
        from file_brain.services.extraction.basic_strategy import BasicExtractionStrategy
        from file_brain.services.extraction.tika_strategy import TikaExtractionStrategy

        tika_endpoint = settings.tika_url if settings.tika_client_only else None

        # Create strategies
        strategies = [
            TikaExtractionStrategy(tika_endpoint=tika_endpoint),
            BasicExtractionStrategy(),
        ]
        _extractor = ContentExtractor(strategies=strategies)

    return _extractor
