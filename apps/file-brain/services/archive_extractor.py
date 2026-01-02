"""
Archive extraction module for File Brain

This module provides comprehensive archive handling functionality, including:
- ZIP, TAR, 7Z, RAR, GZIP, BZ2, XZ support
- Recursive archive extraction
- Integration with Apache Tika for content parsing
"""

import io
import os
import tarfile
import zipfile
from typing import Dict, List, Optional, Any
from pathlib import Path

# Import Tika
from tika import parser

from core.logging import logger


def try_extract_zip(data: bytes) -> Optional[Dict[str, bytes]]:
    """Try to extract as ZIP/JAR/APK/WAR archive"""
    try:
        files = {}
        with zipfile.ZipFile(io.BytesIO(data), "r") as zf:
            for name in zf.namelist():
                if not name.endswith("/"):  # Skip directories
                    files[name] = zf.read(name)
        return files if files else None
    except (zipfile.BadZipFile, Exception):
        return None


def try_extract_tar(data: bytes) -> Optional[Dict[str, bytes]]:
    """Try to extract as TAR archive (including .tar.gz, .tar.bz2, .tar.xz)"""
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


def try_extract_7z(data: bytes) -> Optional[Dict[str, bytes]]:
    """Try to extract as 7z archive"""
    try:
        import py7zr

        files = {}
        with py7zr.SevenZipFile(io.BytesIO(data), mode="r") as sz:
            all_files = sz.readall()
            for name, bio in all_files.items():
                if hasattr(bio, "read"):
                    files[name] = bio.read()
                else:
                    files[name] = bio
        return files if files else None
    except (py7zr.Bad7zFile, Exception):
        return None


def try_extract_rar(data: bytes) -> Optional[Dict[str, bytes]]:
    """Try to extract as RAR archive"""
    try:
        import rarfile

        files = {}
        with rarfile.RarFile(io.BytesIO(data), "r") as rf:
            for name in rf.namelist():
                info = rf.getinfo(name)
                if not info.isdir():
                    files[name] = rf.read(name)
        return files if files else None
    except (rarfile.BadRarFile, Exception):
        return None


def try_extract_gzip(data: bytes) -> Optional[Dict[str, bytes]]:
    """Try to extract as standalone GZIP file"""
    try:
        import gzip

        decompressed = gzip.decompress(data)
        return {"decompressed": decompressed}
    except (OSError, Exception):
        return None


def try_extract_bz2(data: bytes) -> Optional[Dict[str, bytes]]:
    """Try to extract as standalone BZ2 file"""
    try:
        import bz2

        decompressed = bz2.decompress(data)
        return {"decompressed": decompressed}
    except (OSError, Exception):
        return None


def try_extract_xz(data: bytes) -> Optional[Dict[str, bytes]]:
    """Try to extract as standalone XZ file"""
    try:
        import lzma

        decompressed = lzma.decompress(data)
        return {"decompressed": decompressed}
    except (lzma.LZMAError, Exception):
        return None


def extract_archive(
    data: bytes, filename: str = "archive"
) -> Optional[Dict[str, bytes]]:
    """
    Try to extract an archive using multiple methods until one succeeds.

    Args:
        data: Archive file data as bytes
        filename: Original filename (for logging purposes)

    Returns:
        Dictionary mapping filenames to their content (bytes), or None if not an archive
    """
    # List of extraction methods to try, in order
    extraction_methods = [
        ("ZIP/JAR/APK", try_extract_zip),
        ("TAR", try_extract_tar),
        ("7Z", try_extract_7z),
        ("RAR", try_extract_rar),
        ("GZIP", try_extract_gzip),
        ("BZ2", try_extract_bz2),
        ("XZ", try_extract_xz),
    ]

    for format_name, extract_func in extraction_methods:
        try:
            result = extract_func(data)
            if result is not None:
                logger.info(
                    f"Successfully extracted as {format_name}: {filename} ({len(result)} files)"
                )
                return result
        except Exception as e:
            logger.debug(f"Failed to extract as {format_name}: {e}")
            continue

    return None


def parse_archive_recursively(
    data: bytes,
    filename: str = "archive",
    max_depth: int = 5,
    current_depth: int = 0,
    max_file_size: int = 100 * 1024 * 1024,  # 100 MB
    tika_endpoint: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Recursively extract and parse archive contents with Tika, all in memory.

    Args:
        data: Archive file data as bytes
        filename: Original filename (for tracking)
        max_depth: Maximum recursion depth for nested archives
        current_depth: Current recursion depth (internal use)
        max_file_size: Maximum file size to process (in bytes)
        tika_endpoint: Tika server endpoint (if using client-only mode)

    Returns:
        List of dictionaries containing parsed content and metadata
    """
    results = []

    if current_depth >= max_depth:
        logger.warning(f"Max recursion depth reached at: {filename}")
        return results

    # Try to extract the archive
    extracted_files = extract_archive(data, filename)

    if extracted_files is None:
        # Not an archive or extraction failed, try to parse directly with Tika
        try:
            if len(data) > max_file_size:
                logger.warning(
                    f"Skipping large file: {filename} ({len(data) / (1024 * 1024):.1f} MB)"
                )
                return results

            parsed = parser.from_buffer(io.BytesIO(data), tika_endpoint)

            if parsed and parsed.get("content") is not None:
                results.append(
                    {
                        "file_path": filename,
                        "mime_type": parsed["metadata"].get("Content-Type"),
                        "content": parsed["content"],
                        "metadata": parsed["metadata"],
                        "is_archive": False,
                        "depth": current_depth,
                        "size_bytes": len(data),
                    }
                )
        except Exception as e:
            logger.error(f"Error parsing {filename}: {e}")
        return results

    # Archive was extracted successfully - process each file
    for extracted_filename, file_data in extracted_files.items():
        # Skip very large files
        if len(file_data) > max_file_size:
            logger.warning(
                f"Skipping large file: {extracted_filename} ({len(file_data) / (1024 * 1024):.1f} MB)"
            )
            continue

        # Check if this file is also an archive
        nested_files = extract_archive(file_data, extracted_filename)

        if nested_files is not None:
            # It's a nested archive - recurse
            logger.debug(f"Found nested archive: {extracted_filename}")
            nested_results = parse_archive_recursively(
                file_data,
                extracted_filename,
                max_depth=max_depth,
                current_depth=current_depth + 1,
                max_file_size=max_file_size,
                tika_endpoint=tika_endpoint,
            )
            results.extend(nested_results)
        else:
            # Not an archive - parse with Tika
            try:
                parsed = parser.from_buffer(io.BytesIO(file_data), tika_endpoint)

                if parsed and parsed.get("content") is not None:
                    results.append(
                        {
                            "file_path": extracted_filename,
                            "original_archive": filename,
                            "mime_type": parsed["metadata"].get("Content-Type"),
                            "content": parsed["content"] or "",
                            "metadata": parsed["metadata"],
                            "is_archive": False,
                            "depth": current_depth,
                            "size_bytes": len(file_data),
                        }
                    )

                    # Log summary for images (OCR indication)
                    content_type = parsed["metadata"].get("Content-Type", "")
                    if content_type.startswith("image/"):
                        content_preview = (parsed["content"] or "")[:100]
                        if content_preview.strip():
                            logger.debug(
                                f"  ✓ Image with OCR text: {extracted_filename}"
                            )
                        else:
                            logger.debug(
                                f"  ○ Image (no text/OCR): {extracted_filename}"
                            )

            except Exception as e:
                logger.error(f"Error parsing {extracted_filename}: {e}")

    return results


def concatenate_archive_content(
    parsed_files: List[Dict[str, Any]], archive_filename: str
) -> str:
    """
    Concatenate content from all parsed files in an archive.

    Args:
        parsed_files: List of dictionaries containing parsed file content
        archive_filename: Name of the original archive file

    Returns:
        Concatenated content string
    """
    if not parsed_files:
        return ""

    # Create a header indicating this is concatenated archive content
    concatenated_parts = []
    concatenated_parts.append(f"# Archive: {archive_filename}")
    concatenated_parts.append(f"## Extracted Files ({len(parsed_files)} files)")
    concatenated_parts.append("")

    # Add each file's content with proper formatting
    for i, file_info in enumerate(parsed_files, 1):
        file_path = file_info.get("file_path", "unknown")
        content = file_info.get("content", "").strip()

        # Add file separator
        concatenated_parts.append(f"### File {i}: {file_path}")
        concatenated_parts.append("")

        # Add content (if any)
        if content:
            concatenated_parts.append(content)
        else:
            concatenated_parts.append("*(No extractable content)*")

        concatenated_parts.append("")
        concatenated_parts.append("---")
        concatenated_parts.append("")

    return "\n".join(concatenated_parts)


def extract_and_parse_archive(
    file_path: str,
    max_depth: int = 5,
    max_file_size: int = 100 * 1024 * 1024,  # 100 MB
    tika_endpoint: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """
    Extract and parse an archive file, returning concatenated content.

    Args:
        file_path: Path to the archive file
        max_depth: Maximum recursion depth for nested archives
        max_file_size: Maximum file size to process (in bytes)
        tika_endpoint: Tika server endpoint (if using client-only mode)

    Returns:
        Dictionary with concatenated content and metadata, or None if extraction fails
    """
    try:
        # Read file data
        with open(file_path, "rb") as f:
            data = f.read()

        filename = os.path.basename(file_path)

        # Parse archive recursively
        parsed_files = parse_archive_recursively(
            data=data,
            filename=filename,
            max_depth=max_depth,
            max_file_size=max_file_size,
            tika_endpoint=tika_endpoint,
        )

        if not parsed_files:
            logger.warning(f"No extractable content found in archive: {file_path}")
            return None

        # Concatenate all content
        concatenated_content = concatenate_archive_content(parsed_files, filename)

        # Aggregate metadata
        total_size = sum(f.get("size_bytes", 0) for f in parsed_files)
        mime_types = list(set(f.get("mime_type", "unknown") for f in parsed_files))

        # Create comprehensive metadata
        metadata = {
            "extraction_method": "archive_parsing",
            "archive_filename": filename,
            "files_extracted": len(parsed_files),
            "total_content_size": len(concatenated_content),
            "total_original_size": total_size,
            "nested_archive_depth": max(f.get("depth", 0) for f in parsed_files)
            if parsed_files
            else 0,
            "mime_types_found": mime_types,
            "files_with_content": len(
                [f for f in parsed_files if f.get("content", "").strip()]
            ),
            "extracted_files": [
                {
                    "file_path": f.get("file_path"),
                    "mime_type": f.get("mime_type"),
                    "size_bytes": f.get("size_bytes"),
                    "content_length": len(f.get("content", "")),
                    "depth": f.get("depth"),
                }
                for f in parsed_files
            ],
        }

        logger.info(
            f"Successfully extracted and parsed archive: {filename} ({len(parsed_files)} files)"
        )

        return {"content": concatenated_content, "metadata": metadata}

    except Exception as e:
        logger.error(f"Error extracting and parsing archive {file_path}: {e}")
        return None


def is_likely_archive(file_path: str) -> bool:
    """
    Check if a file is likely to be an archive based on extension.

    Args:
        file_path: Path to the file

    Returns:
        True if the file extension suggests it's an archive
    """
    archive_extensions = {
        ".zip",
        ".jar",
        ".war",
        ".ear",
        ".apk",
        ".tar",
        ".tar.gz",
        ".tgz",
        ".tar.bz2",
        ".tbz2",
        ".tar.xz",
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

    file_ext = Path(file_path).suffix.lower()
    return file_ext in archive_extensions
