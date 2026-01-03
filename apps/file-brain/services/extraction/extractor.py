"""
Document content extraction using Apache Tika with comprehensive format support
including archive handling.

Uses Strategy pattern for pluggable extraction methods.
"""

import os
from typing import List, Optional

from api.models.file_event import DocumentContent
from core.config import settings
from core.logging import logger
from services.extraction.protocol import ExtractionStrategy


class ContentExtractor:
    """
    Document content extractor using pluggable extraction strategies.

    Uses Strategy pattern to select appropriate extraction method:
    1. Archive extraction for archive files (.zip, .tar.gz, etc.)
    2. Tika extraction for documents, images, etc.
    3. Basic extraction as fallback
    """

    def __init__(self, strategies: Optional[List[ExtractionStrategy]] = None):
        """Initialize the content extractor with extraction strategies."""
        # Configure tika-python for client-only mode when Docker Tika is enabled
        if settings.tika_enabled and settings.tika_client_only:
            os.environ["TIKA_CLIENT_ONLY"] = "True"
            logger.info(f"Configured Tika client-only mode for endpoint: {settings.tika_url}")

        # Initialize strategies (can be injected for testing)
        if strategies is not None:
            self.strategies = strategies
        else:
            self.strategies = self._create_default_strategies()

    def _create_default_strategies(self) -> List[ExtractionStrategy]:
        """Create the default chain of extraction strategies."""
        from services.extraction.archive_strategy import ArchiveExtractionStrategy
        from services.extraction.basic_strategy import BasicExtractionStrategy
        from services.extraction.tika_strategy import TikaExtractionStrategy

        tika_endpoint = settings.tika_url if settings.tika_client_only else None

        # Create inner strategies for archive extraction
        tika_strategy = TikaExtractionStrategy(tika_endpoint=tika_endpoint)
        basic_strategy = BasicExtractionStrategy()

        # Archive strategy uses Tika and Basic for files within archives
        archive_strategy = ArchiveExtractionStrategy(
            inner_strategies=[tika_strategy, basic_strategy],
        )

        return [archive_strategy, tika_strategy, basic_strategy]

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
        for strategy in self.strategies:
            if strategy.can_extract(file_path):
                try:
                    return strategy.extract(file_path)
                except Exception as e:
                    logger.warning(f"{strategy.__class__.__name__} failed for {file_path}: {e}")
                    last_error = e

        if last_error:
            logger.error(f"All extraction strategies failed for {file_path}")
            raise last_error

        return DocumentContent(content="", metadata={"error": "No extraction strategy available"})


# Global extractor instance
_extractor: Optional[ContentExtractor] = None


def get_extractor() -> ContentExtractor:
    """Get or create global extractor instance"""
    global _extractor
    if _extractor is None:
        _extractor = ContentExtractor()
    return _extractor
