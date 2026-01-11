"""
Extraction Strategy Protocol

Defines the interface for all extraction strategies.
"""

from typing import Protocol

from file_brain.api.models.file_event import DocumentContent


class ExtractionStrategy(Protocol):
    """Protocol for extraction strategies."""

    def can_extract(self, file_path: str) -> bool:
        """
        Check if this strategy can handle the given file.

        Args:
            file_path: Path to the file

        Returns:
            True if this strategy can extract the file
        """
        ...

    def extract(self, file_path: str) -> DocumentContent:
        """
        Extract content from the file.

        Args:
            file_path: Path to the file

        Returns:
            DocumentContent with extracted content and metadata
        """
        ...
