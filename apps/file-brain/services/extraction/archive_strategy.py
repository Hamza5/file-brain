"""
Archive Extraction Strategy

Extracts content from archive files (.zip, .tar.gz, etc.) using injected
strategies for parsing the files within the archive.
"""

import bz2
import gzip
import io
import lzma
import os
import tarfile
import tempfile
import zipfile
from pathlib import Path
from typing import Any, Dict, List, Optional

from api.models.file_event import DocumentContent
from core.logging import logger
from services.extraction.protocol import ExtractionStrategy

# Optional dependencies with graceful fallback
try:
    import py7zr

    PY7ZR_AVAILABLE = True
except ImportError:
    py7zr = None
    PY7ZR_AVAILABLE = False

try:
    import rarfile

    RARFILE_AVAILABLE = True
except ImportError:
    rarfile = None
    RARFILE_AVAILABLE = False


# Archive extension constants
COMPOUND_EXTENSIONS = {".tar.gz", ".tar.bz2", ".tar.xz"}
SINGLE_EXTENSIONS = {
    ".zip",
    ".jar",
    ".war",
    ".ear",
    ".apk",
    ".tar",
    ".tgz",
    ".tbz2",
    ".txz",
    ".7z",
    ".7za",
    ".rar",
    ".rar4",
    ".rar5",
    ".gz",
    ".gzip",
    ".bz2",
    ".bzip2",
    ".xz",
    ".lzma",
}


def is_likely_archive(file_path: str) -> bool:
    """Check if a file is likely to be an archive based on extension."""
    name_lower = Path(file_path).name.lower()

    for ext in COMPOUND_EXTENSIONS:
        if name_lower.endswith(ext):
            return True

    file_ext = Path(file_path).suffix.lower()
    return file_ext in SINGLE_EXTENSIONS


class ArchiveExtractionStrategy:
    """
    Strategy for extracting content from archive files.

    Uses dependency injection for the strategies used to extract
    files within the archive, respecting proper separation of concerns.
    """

    def __init__(
        self,
        inner_strategies: Optional[List[ExtractionStrategy]] = None,
        max_depth: int = 5,
        max_file_size: int = 100 * 1024 * 1024,
    ):
        """
        Initialize the archive extraction strategy.

        Args:
            inner_strategies: Strategies to use for extracting files within archives.
                             If None, defaults to Tika + Basic strategies.
            max_depth: Maximum recursion depth for nested archives
            max_file_size: Maximum file size to process (in bytes)
        """
        self._inner_strategies = inner_strategies
        self.max_depth = max_depth
        self.max_file_size = max_file_size

    @property
    def inner_strategies(self) -> List[ExtractionStrategy]:
        """Get strategies for extracting files within archives (lazy load)."""
        if self._inner_strategies is None:
            from services.extraction.basic_strategy import BasicExtractionStrategy
            from services.extraction.tika_strategy import TikaExtractionStrategy

            self._inner_strategies = [
                TikaExtractionStrategy(),
                BasicExtractionStrategy(),
            ]
        return self._inner_strategies

    def can_extract(self, file_path: str) -> bool:
        """Check if file is an archive."""
        return is_likely_archive(file_path)

    def extract(self, file_path: str) -> DocumentContent:
        """Extract content from archive file."""
        logger.info(f"Extracting archive content: {file_path}")

        with open(file_path, "rb") as f:
            data = f.read()

        filename = os.path.basename(file_path)
        parsed_files = self._parse_archive_recursively(data, filename, 0)

        if not parsed_files:
            raise ValueError(f"No extractable content found in archive: {file_path}")

        content = self._concatenate_content(parsed_files, filename)

        metadata = {
            "extraction_method": "archive_parsing",
            "files_extracted": len(parsed_files),
            "is_archive": True,
        }

        logger.info(f"Successfully extracted archive: {filename} ({len(parsed_files)} files)")
        return DocumentContent(content=content, metadata=metadata)

    def _parse_archive_recursively(
        self,
        data: bytes,
        filename: str,
        current_depth: int,
    ) -> List[Dict[str, Any]]:
        """Recursively extract and parse archive contents using inner strategies."""
        results = []

        if current_depth >= self.max_depth:
            logger.warning(f"Max recursion depth reached at: {filename}")
            return results

        extracted_files = self._extract_archive(data, filename)

        if extracted_files is None:
            # Not an archive - parse with inner strategies
            result = self._extract_with_strategies(data, filename, current_depth)
            if result:
                results.append(result)
            return results

        # Process each extracted file
        for extracted_filename, file_data in extracted_files.items():
            if len(file_data) > self.max_file_size:
                logger.warning(f"Skipping large file: {extracted_filename}")
                continue

            # Check for nested archive
            nested_files = self._extract_archive(file_data, extracted_filename)

            if nested_files is not None:
                logger.debug(f"Found nested archive: {extracted_filename}")
                nested_results = self._parse_archive_recursively(file_data, extracted_filename, current_depth + 1)
                results.extend(nested_results)
            else:
                result = self._extract_with_strategies(file_data, extracted_filename, current_depth)
                if result:
                    results.append(result)

        return results

    def _extract_with_strategies(
        self,
        data: bytes,
        filename: str,
        depth: int,
    ) -> Optional[Dict[str, Any]]:
        """Extract content from bytes using inner strategies (via temp file)."""
        if len(data) > self.max_file_size:
            logger.warning(f"Skipping large file: {filename}")
            return None

        # Create temp file for strategy extraction
        suffix = Path(filename).suffix or ".tmp"
        try:
            with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
                tmp.write(data)
                tmp_path = tmp.name

            # Try each inner strategy
            for strategy in self.inner_strategies:
                if strategy.can_extract(tmp_path):
                    try:
                        result = strategy.extract(tmp_path)
                        if result.content.strip():
                            return {
                                "file_path": filename,
                                "content": result.content,
                                "metadata": result.metadata,
                                "depth": depth,
                                "size_bytes": len(data),
                            }
                    except Exception as e:
                        logger.debug(f"{strategy.__class__.__name__} failed for {filename}: {e}")
                        continue

            return None

        except Exception as e:
            logger.error(f"Error extracting {filename}: {e}")
            return None
        finally:
            # Cleanup temp file
            try:
                os.unlink(tmp_path)
            except Exception:
                pass

    def _extract_archive(self, data: bytes, filename: str) -> Optional[Dict[str, bytes]]:
        """Try to extract an archive using multiple methods."""
        extractors = [
            ("ZIP", self._try_zip),
            ("TAR", self._try_tar),
            ("7Z", self._try_7z),
            ("RAR", self._try_rar),
            ("GZIP", self._try_gzip),
            ("BZ2", self._try_bz2),
            ("XZ", self._try_xz),
        ]

        for format_name, extractor in extractors:
            try:
                result = extractor(data)
                if result is not None:
                    logger.info(f"Extracted as {format_name}: {filename} ({len(result)} files)")
                    return result
            except Exception as e:
                logger.debug(f"Failed {format_name}: {e}")

        return None

    @staticmethod
    def _try_zip(data: bytes) -> Optional[Dict[str, bytes]]:
        try:
            files = {}
            with zipfile.ZipFile(io.BytesIO(data), "r") as zf:
                for name in zf.namelist():
                    if not name.endswith("/"):
                        files[name] = zf.read(name)
            return files if files else None
        except (zipfile.BadZipFile, Exception):
            return None

    @staticmethod
    def _try_tar(data: bytes) -> Optional[Dict[str, bytes]]:
        try:
            files = {}
            with tarfile.open(fileobj=io.BytesIO(data), mode="r:*") as tf:
                for member in tf.getmembers():
                    if member.isfile():
                        file_obj = tf.extractfile(member)
                        if file_obj:
                            files[member.name] = file_obj.read()
            return files if files else None
        except (tarfile.TarError, Exception):
            return None

    @staticmethod
    def _try_7z(data: bytes) -> Optional[Dict[str, bytes]]:
        if not PY7ZR_AVAILABLE:
            return None
        try:
            files = {}
            with py7zr.SevenZipFile(io.BytesIO(data), mode="r") as sz:
                for name, bio in sz.readall().items():
                    files[name] = bio.read() if hasattr(bio, "read") else bio
            return files if files else None
        except Exception:
            return None

    @staticmethod
    def _try_rar(data: bytes) -> Optional[Dict[str, bytes]]:
        if not RARFILE_AVAILABLE:
            return None
        try:
            files = {}
            with rarfile.RarFile(io.BytesIO(data), "r") as rf:
                for name in rf.namelist():
                    info = rf.getinfo(name)
                    if not info.isdir():
                        files[name] = rf.read(name)
            return files if files else None
        except Exception:
            return None

    @staticmethod
    def _try_gzip(data: bytes) -> Optional[Dict[str, bytes]]:
        try:
            return {"decompressed": gzip.decompress(data)}
        except Exception:
            return None

    @staticmethod
    def _try_bz2(data: bytes) -> Optional[Dict[str, bytes]]:
        try:
            return {"decompressed": bz2.decompress(data)}
        except Exception:
            return None

    @staticmethod
    def _try_xz(data: bytes) -> Optional[Dict[str, bytes]]:
        try:
            return {"decompressed": lzma.decompress(data)}
        except Exception:
            return None

    @staticmethod
    def _concatenate_content(parsed_files: List[Dict[str, Any]], archive_name: str) -> str:
        """Concatenate content from all parsed files."""
        if not parsed_files:
            return ""

        parts = [
            f"# Archive: {archive_name}",
            f"## Extracted Files ({len(parsed_files)} files)",
            "",
        ]

        for i, file_info in enumerate(parsed_files, 1):
            file_path = file_info.get("file_path", "unknown")
            content = file_info.get("content", "").strip()

            parts.append(f"### File {i}: {file_path}")
            parts.append("")
            parts.append(content if content else "*(No extractable content)*")
            parts.append("")
            parts.append("---")
            parts.append("")

        return "\n".join(parts)


# Protocol compliance verification
_: ExtractionStrategy = ArchiveExtractionStrategy()  # type: ignore[assignment]
