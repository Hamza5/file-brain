"""
Basic Extraction Strategy

Fallback strategy for basic text extraction from any file.
"""

import re
from typing import Optional

import chardet

from file_brain.api.models.file_event import DocumentContent
from file_brain.core.logging import logger
from file_brain.services.extraction.protocol import ExtractionStrategy


class BasicExtractionStrategy:
    """Fallback strategy for basic text extraction."""

    def can_extract(self, file_path: str) -> bool:
        """Always returns True as this is the fallback strategy."""
        return True

    def extract(self, file_path: str) -> DocumentContent:
        """Extract content using basic text detection."""
        logger.info(f"Attempting basic extraction for: {file_path}")

        text = self._extract_smart_text(file_path)

        if text:
            logger.info(f"Smart text extraction successful: {len(text)} characters")
            return DocumentContent(
                content=text,
                metadata={
                    "extraction_method": "smart_text",
                },
            )

        logger.warning(f"No extractable text found in {file_path}")
        return DocumentContent(
            content="",
            metadata={
                "extraction_method": "basic_fallback",
                "extraction_note": "No extractable text content found",
            },
        )

    def _extract_smart_text(
        self,
        file_path: str,
        min_word_length: int = 3,
        max_text_size: int = 10 * 1024 * 1024,
    ) -> Optional[str]:
        """
        Smart text extraction from any file.
        Attempts to extract strings from binary files.
        """
        try:
            with open(file_path, "rb") as f:
                data = f.read(max_text_size)

            result = chardet.detect(data)
            encoding = result.get("encoding", "utf-8")
            confidence = result.get("confidence", 0)

            if confidence > 0.8:
                try:
                    text = data.decode(encoding, errors="ignore")
                    text = "".join(c for c in text if c.isprintable() or c in "\n\r\t")

                    words = text.split()
                    valid_words = [w for w in words if len(w) >= min_word_length]
                    if len(valid_words) >= 10:
                        return text.strip()
                except Exception:
                    pass

            # Fallback: Extract ASCII strings
            strings = re.findall(rb"[\x20-\x7e]{4,}", data)
            if strings:
                extracted = b"\n".join(strings).decode("ascii", errors="ignore")
                if len(extracted) > 50:
                    return extracted

            return None

        except Exception as e:
            logger.debug(f"Smart text extraction failed for {file_path}: {e}")
            return None


# Verify protocol compliance
_: ExtractionStrategy = BasicExtractionStrategy()  # type: ignore[assignment]
