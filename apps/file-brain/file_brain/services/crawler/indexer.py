"""
File Indexer component
"""

import hashlib
import os
import threading
from pathlib import Path
from typing import Callable, Optional, Tuple

from file_brain.api.models.operations import CrawlOperation, OperationType
from file_brain.core.logging import logger
from file_brain.services.extraction.extractor import get_extractor
from file_brain.services.typesense_client import get_typesense_client


class FileIndexer:
    """
    Handles indexing of a single file.
    """

    def __init__(self):
        self.typesense = get_typesense_client()
        self.extractor = get_extractor()
        self._stop_event = threading.Event()

    def stop(self):
        """Signal the indexing process to stop."""
        self._stop_event.set()

    def reset(self):
        """Reset the indexer state for a new crawl."""
        self._stop_event.clear()

    def index_file(
        self, operation: CrawlOperation, progress_callback: Optional[Callable[[int, int], None]] = None
    ) -> bool:
        """
        Index a single file.
        """
        if self._stop_event.is_set():
            return False

        if operation.operation == OperationType.DELETE:
            return self._handle_delete_operation(operation)
        else:
            return self._handle_create_edit_operation(operation, progress_callback)

    def _handle_create_edit_operation(
        self, operation: CrawlOperation, progress_callback: Optional[Callable[[int, int], None]] = None
    ) -> bool:
        file_path = operation.file_path

        if not self._check_file_accessibility(file_path)[0]:
            logger.warning(f"File not accessible: {file_path}")
            return False

        max_size_mb = int(os.getenv("MAX_FILE_SIZE_MB", "100"))
        max_size_bytes = max_size_mb * 1024 * 1024
        if operation.file_size and operation.file_size > max_size_bytes:
            logger.warning(f"File too large: {file_path}")
            return False

        file_hash = self._calculate_file_hash(file_path)
        if not file_hash:
            return False

        existing_doc = self.typesense.get_doc_by_path(file_path)
        if existing_doc and existing_doc.get("file_hash") == file_hash:
            logger.debug(f"Skipping unchanged file: {file_path}")
            return True

        # Extract document content
        document_content = self.extractor.extract(file_path)

        # Import chunking utilities
        from file_brain.services.chunker import chunk_text, generate_chunk_hash, get_chunk_config

        # Get chunking configuration
        chunk_size, overlap = get_chunk_config()

        # Split content into chunks
        content_chunks = chunk_text(document_content.content, chunk_size, overlap)
        total_chunks = len(content_chunks)

        logger.info(f"Indexing {file_path} as {total_chunks} chunk(s)")

        # Index each chunk with complete metadata
        for chunk_index, chunk_content in enumerate(content_chunks):
            if progress_callback:
                progress_callback(chunk_index, total_chunks)

            chunk_hash = generate_chunk_hash(file_path, chunk_index, chunk_content)

            # All chunks get complete metadata
            self.typesense.index_file(
                file_path=file_path,
                content=chunk_content,
                chunk_index=chunk_index,
                chunk_total=total_chunks,
                chunk_hash=chunk_hash,
                file_extension=Path(file_path).suffix.lower(),
                file_size=operation.file_size,
                mime_type=document_content.metadata.get("mime_type") or "application/octet-stream",
                modified_time=int(operation.modified_time) if operation.modified_time is not None else 0,
                created_time=int(operation.created_time) if operation.created_time is not None else 0,
                file_hash=file_hash,
                metadata=document_content.metadata,
            )

        return True

    def _handle_delete_operation(self, operation: CrawlOperation) -> bool:
        try:
            self.typesense.remove_from_index(operation.file_path)
            return True
        except Exception as e:
            logger.error(f"Error deleting {operation.file_path} from index: {e}")
            return False

    def _check_file_accessibility(self, file_path: str) -> Tuple[bool, str]:
        if not os.path.exists(file_path):
            return False, "File does not exist"
        if not os.path.isfile(file_path):
            return False, "Path is not a file"
        if not os.access(file_path, os.R_OK):
            return False, "File is not readable"
        return True, "File is accessible"

    def _calculate_file_hash(self, file_path: str) -> str:
        """Calculate MD5 hash of file (runs in current thread)."""
        try:
            hash_md5 = hashlib.md5()
            with open(file_path, "rb") as f:
                for chunk in iter(lambda: f.read(4096), b""):
                    hash_md5.update(chunk)
            return hash_md5.hexdigest()
        except Exception as e:
            logger.error(f"Error calculating file hash for {file_path}: {e}")
            return ""
