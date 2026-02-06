"""
Tika Extraction Strategy

Extracts content from documents using Apache Tika.
"""

import time
from typing import Any, Dict, Optional

from file_brain.api.models.file_event import DocumentContent
from file_brain.core.config import settings
from file_brain.core.logging import logger
from file_brain.services.extraction.exceptions import ExtractionFallbackNotAllowed
from file_brain.services.extraction.protocol import ExtractionStrategy


class TikaExtractionStrategy:
    """Strategy for extracting content using Apache Tika."""

    def __init__(self, tika_endpoint: Optional[str] = None):
        self.tika_endpoint = tika_endpoint

    def can_extract(self, file_path: str) -> bool:
        """Check if Tika extraction is enabled and available."""
        return settings.tika_enabled

    def extract(self, file_path: str) -> DocumentContent:
        """
        Extract content using Tika with retries and timeouts.

        If the file is detected as Tika-supported but extraction fails after retries,
        raises ExtractionFallbackNotAllowed to prevent fallback to basic extraction.
        """
        from tika import detector, parser

        logger.info(f"Extracting with Tika: {file_path}")

        # Check if Tika supports this file type
        is_supported = self._is_tika_supported(file_path, detector)

        # Define retry timeouts (in seconds)
        # 60s (default) -> 120s -> 240s
        timeouts = [60, 120, 240]

        last_error = None

        for attempt, timeout in enumerate(timeouts):
            try:
                logger.debug(f"Tika extraction attempt {attempt + 1}/{len(timeouts)} with timeout {timeout}s")

                request_options = {"timeout": timeout}

                if self.tika_endpoint:
                    parsed = parser.from_file(file_path, self.tika_endpoint, requestOptions=request_options)
                else:
                    parsed = parser.from_file(file_path, requestOptions=request_options)

                if not parsed:
                    raise ValueError(f"Tika returned empty result for {file_path}")

                # Check for status code errors if present
                status = parsed.get("status")
                if status and status != 200:
                    raise ValueError(f"Tika returned status {status}")

                content = parsed.get("content")
                if content is None:
                    # Some files might just be empty or metadata only
                    content = ""

                content = content.strip()
                if not content:
                    # If we got no content, check if we expected some
                    # For now we enable empty content if metadata exists, but warning
                    logger.warning(f"Tika extracted empty content for {file_path}")

                raw_metadata = parsed.get("metadata", {})
                metadata = self._process_metadata(raw_metadata)

                if self.tika_endpoint:
                    metadata["tika_endpoint"] = self.tika_endpoint

                logger.info(f"Successfully extracted {len(content)} characters from {file_path}")
                return DocumentContent(content=content, metadata=metadata)

            except Exception as e:
                logger.warning(f"Tika attempt {attempt + 1} failed: {e}")
                last_error = e
                # Wait a bit before retry, maybe?
                time.sleep(1)

        # If we reached here, all retries failed
        logger.error(f"All Tika retries failed for {file_path}. Last error: {last_error}")

        if is_supported:
            logger.error(f"File {file_path} is supported by Tika but extraction failed. Preventing fallback.")
            raise ExtractionFallbackNotAllowed(f"Tika failed to extract supported file: {last_error}")

        # If not uniquely supported (or detection failed), re-raise to allow fallback if applicable
        if last_error:
            raise last_error
        raise ValueError("Tika extraction failed with unknown error")

    def _is_tika_supported(self, file_path: str, detector_module: Any) -> bool:
        """
        Check if the file is supported by Tika.
        Uses Tika's detector.
        """
        try:
            # Use detector to get mime type
            if self.tika_endpoint:
                mime_type = detector_module.from_file(file_path, self.tika_endpoint)
            else:
                mime_type = detector_module.from_file(file_path)

            logger.debug(f"Tika detected mime-type: {mime_type}")

            if not mime_type:
                logger.warning("Tika detector returned no mime-type")
                return False

            # Tika returns 'application/octet-stream' for unknown binary files or empty files.
            # In these cases, we return False to allow fallback to BasicExtractionStrategy,
            # which attempts smart text extraction from binaries or handles empty files gracefully.
            if mime_type == "application/octet-stream":
                logger.debug("Tika detected application/octet-stream (unsupported/unknown)")
                return False

            # For any other detected mime-type (including text/*, application/pdf, etc.),
            # we consider it supported by Tika.
            return True

        except Exception as e:
            logger.warning(f"Tika detection failed: {e}")
            # If detection fails, we err on the side of not supporting it to allow fallback
            return False

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
