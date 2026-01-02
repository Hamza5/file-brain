"""
Document content extraction using Apache Tika with comprehensive format support
including archive handling
"""

import mimetypes
import os
import re
from typing import Any, Dict, Optional

# Import chardet for smart text extraction
import chardet

# Import Tika
from tika import parser

from api.models.file_event import DocumentContent
from core.config import settings
from core.logging import logger
from services.archive_extractor import extract_and_parse_archive, is_likely_archive


class ContentExtractor:
    """Document content extractor using Apache Tika"""

    def __init__(self):
        """Initialize the content extractor with Tika configuration"""
        # Configure tika-python for client-only mode when Docker Tika is enabled
        if settings.tika_enabled and settings.tika_client_only:
            os.environ["TIKA_CLIENT_ONLY"] = "True"
            logger.info(f"Configured Tika client-only mode for endpoint: {settings.tika_url}")

    def extract(self, file_path: str) -> DocumentContent:
        """
        Extract content from file using Tika

        Args:
            file_path: Path to file

        Returns:
            DocumentContent with markdown and metadata

        Raises:
            FileNotFoundError: If file doesn't exist
            Exception: For extraction errors
        """
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"File not found: {file_path}")

        # Check if it's likely an archive file
        if is_likely_archive(file_path):
            logger.info(f"Processing as archive: {file_path}")
            return self._extract_archive(file_path)

        # Check if Tika is enabled
        if not settings.tika_enabled:
            logger.info("Tika extraction disabled, using basic extraction")
            return self._extract_basic(file_path)

        # Try Tika extraction
        try:
            return self._extract_with_tika(file_path)
        except Exception as e:
            logger.warning(f"Tika extraction failed for {file_path}: {e}")
            logger.info("Falling back to basic extraction")

        # Fallback to basic extraction
        return self._extract_basic(file_path)

    def _extract_archive(self, file_path: str) -> DocumentContent:
        """
        Extract content from archive files using recursive parsing
        """
        logger.info(f"Extracting archive content: {file_path}")

        try:
            # Configure Tika endpoint
            tika_endpoint = settings.tika_url if settings.tika_client_only else None

            # Extract and parse the archive
            result = extract_and_parse_archive(
                file_path=file_path,
                max_depth=5,
                max_file_size=100 * 1024 * 1024,  # 100 MB
                tika_endpoint=tika_endpoint,
            )

            if result is None:
                logger.warning(f"Failed to extract archive content: {file_path}")
                return self._extract_basic(file_path)

            # Process the archive metadata and update with file info
            metadata = result["metadata"]
            content = result["content"]

            # Add file-specific metadata
            file_stats = os.stat(file_path)
            metadata.update(
                {
                    "extraction_method": "archive_parsing",
                    "file_size": file_stats.st_size,
                    "file_mtime": file_stats.st_mtime,
                    "is_archive": True,
                }
            )

            logger.info(f"Successfully extracted archive: {file_path} ({metadata.get('files_extracted', 0)} files)")

            return DocumentContent(content=content, metadata=metadata)

        except Exception as e:
            logger.error(f"Error during archive extraction of {file_path}: {e}")
            # Fall back to basic extraction
            return self._extract_basic(file_path)

    def _extract_with_tika(self, file_path: str) -> DocumentContent:
        """Extract using Apache Tika"""
        logger.info(f"Extracting with Tika: {file_path}")

        try:
            # Configure Tika endpoint
            tika_endpoint = settings.tika_url if settings.tika_client_only else None

            # Parse the file using Tika
            if tika_endpoint:
                logger.debug(f"Using Tika endpoint: {tika_endpoint}")
                parsed = parser.from_file(file_path, tika_endpoint)
            else:
                parsed = parser.from_file(file_path)

            if not parsed or "content" not in parsed:
                logger.warning(f"Tika returned empty result for {file_path}")
                return self._extract_basic(file_path)

            # Extract content
            content = parsed.get("content", "").strip()

            # If content is empty after Tika extraction, fall back to basic extraction
            if not content:
                logger.warning(f"Tika extracted empty content for {file_path}")
                return self._extract_basic(file_path)

            # Extract and process metadata
            raw_metadata = parsed.get("metadata", {})
            metadata = self._process_tika_metadata(raw_metadata)

            # Add Tika endpoint information to metadata
            if tika_endpoint:
                metadata["tika_endpoint"] = tika_endpoint

            logger.info(f"Successfully extracted {len(content)} characters from {file_path}")

            return DocumentContent(content=content, metadata=metadata)

        except ConnectionError as e:
            logger.error(f"Connection error to Tika server {settings.tika_url}: {e}")
            logger.info("Ensure Tika Docker container is running on the configured port")
            raise
        except Exception as e:
            logger.error(f"Error during Tika extraction of {file_path}: {e}")
            # Enhanced error handling for Docker connectivity
            if "Connection refused" in str(e) or "Failed to connect" in str(e):
                logger.error(f"Cannot connect to Tika server at {settings.tika_url}")
                logger.error("Please ensure the Tika Docker container is running")
            raise

    def _process_tika_metadata(self, raw_metadata: Dict[str, Any]) -> Dict[str, Any]:
        """
        Process Tika metadata to extract useful fields

        Args:
            raw_metadata: Raw metadata from Tika

        Returns:
            Processed metadata dictionary
        """
        metadata: Dict[str, Any] = {
            "extraction_method": "tika",
        }

        # Common metadata fields that Tika can extract
        field_mapping = {
            "title": "title",
            "Author": "author",
            "Creation-Date": "created_date",
            "CreationDate": "created_date",
            "last-modified": "modified_date",
            "lastModified": "modified_date",
            "Content-Type": "content_type",
            "application": "application",
            "producer": "producer",
            "creator": "creator",
            "Subject": "subject",
            "Description": "description",
            "Comments": "comments",
            "Revision": "revision",
            "Keywords": "keywords",
            "Language": "language",
        }

        # Extract mapped fields
        for tika_key, our_key in field_mapping.items():
            if tika_key in raw_metadata and raw_metadata[tika_key]:
                metadata[our_key] = str(raw_metadata[tika_key])

        # Handle special cases for dates
        for date_key in [
            "Creation-Date",
            "CreationDate",
            "last-modified",
            "lastModified",
        ]:
            if date_key in raw_metadata and raw_metadata[date_key]:
                # Tika often returns dates in ISO format or human readable format
                metadata[f"{date_key.replace('-', '_').lower()}"] = str(raw_metadata[date_key])

        # Handle metadata as lists (like keywords)
        for key in ["keywords", "creator", "author"]:
            if key in raw_metadata:
                value = raw_metadata[key]
                if isinstance(value, list):
                    metadata[key] = value
                elif isinstance(value, str):
                    # Try to split if it looks like a list
                    if "," in value:
                        metadata[key] = [v.strip() for v in value.split(",")]
                    else:
                        metadata[key] = [value]

        # Add all raw metadata for advanced use cases
        # (but only include non-empty values to keep it clean)
        clean_raw_metadata = {}
        for k, v in raw_metadata.items():
            if v is not None and str(v).strip():
                clean_raw_metadata[k] = str(v)

        metadata["raw_tika_metadata"] = clean_raw_metadata

        return metadata

    def _extract_smart_text(
        self,
        file_path: str,
        min_word_length: int = 3,
        min_text_ratio: float = 0.3,
        max_text_size: int = 10 * 1024 * 1024,
    ) -> Optional[str]:
        """
        Smart text extraction from any file.
        Attempts to extract strings from binary files (similar to 'strings' command).

        Args:
            file_path: Path to file
            min_word_length: Minimum word length to consider (used for validation only)
            min_text_ratio: Minimum ratio of alphanumeric characters to total text (ignored now)
            max_text_size: Maximum amount of text to extract (default 10MB)

        Returns:
            Extracted text or None if extraction fails or yields no text
        """
        try:
            # First pass: Read header to detect encoding
            header_size = 4096
            with open(file_path, "rb") as f:
                header = f.read(header_size)

            if not header:
                return None

            # Detect encoding
            detected = chardet.detect(header)
            encoding = detected.get("encoding")
            confidence = detected.get("confidence", 0)

            # Fallback to utf-8 if detection fails or is low confidence
            # This allows us to process binaries that might contain utf-8 strings
            if not encoding or confidence < 0.6:
                encoding = "utf-8"

            # Second pass: Read file in chunks, decode, and filter
            extracted_parts = []
            total_size = 0
            chunk_size = 1024 * 1024  # 1MB chunks

            with open(file_path, "rb") as f:
                while True:
                    chunk = f.read(chunk_size)
                    if not chunk:
                        break

                    # specific error handling 'ignore' helps skipping invalid bytes in binaries
                    text_chunk = chunk.decode(encoding, errors="ignore")

                    # Filter for printable characters immediately to save memory/processing
                    # This effectively acts like the 'strings' command
                    clean_chunk = "".join(c for c in text_chunk if c.isprintable() or c.isspace())

                    # Collapse multiple spaces? Maybe later. For now just raw extraction.

                    if clean_chunk:
                        extracted_parts.append(clean_chunk)
                        total_size += len(clean_chunk)

                    if total_size >= max_text_size:
                        logger.info(f"Breaking extraction at limit ({max_text_size} bytes) for {file_path}")
                        break

            full_text = "".join(extracted_parts)

            # Post-processing: cleanup excessive whitespace that often occurs in binaries
            full_text = re.sub(r"\s+", " ", full_text).strip()

            if len(full_text) < min_word_length:
                return None

            logger.info(f"Smart text extraction successful: {len(full_text)} characters from {file_path}")
            return full_text

        except Exception as e:
            logger.debug(f"Smart extraction failed for {file_path}: {e}")
            return None

    def _extract_basic(self, file_path: str) -> DocumentContent:
        """
        Fallback basic extraction using smart text detection.
        """
        logger.info(f"Attempting basic smart extraction for: {file_path}")

        try:
            # Get MIME type
            mime_type, _ = mimetypes.guess_type(file_path)
            file_stats = os.stat(file_path)

            # Attempt smart text extraction
            extracted_text = self._extract_smart_text(file_path)

            if extracted_text:
                return DocumentContent(
                    content=extracted_text,
                    metadata={
                        "extraction_method": "basic_smart_text",
                        "mime_type": mime_type,
                        "file_size": file_stats.st_size,
                        "encoding_detection": "chardet",
                    },
                )
            else:
                # Return empty content if smart extraction failed (likely binary)
                return DocumentContent(
                    content="",
                    metadata={
                        "extraction_method": "failed_basic",
                        "mime_type": mime_type,
                        "file_size": file_stats.st_size,
                        "reason": "Smart extraction failed or binary file detected",
                    },
                )

        except Exception as e:
            logger.error(f"Error in basic extraction: {e}")
            return DocumentContent(
                content="",
                metadata={"extraction_method": "error", "error": str(e)},
            )


# Global extractor instance
_extractor: Optional[ContentExtractor] = None


def get_extractor() -> ContentExtractor:
    """Get or create global extractor instance"""
    global _extractor
    if _extractor is None:
        _extractor = ContentExtractor()
    return _extractor
