"""
File Indexer component
"""

import asyncio
import hashlib
import mimetypes
import os
from pathlib import Path
from typing import Tuple

from api.models.operations import CrawlOperation, OperationType
from core.logging import logger
from services.extraction.extractor import get_extractor
from services.typesense_client import get_typesense_client


class FileIndexer:
    """
    Handles indexing of a single file.
    """

    def __init__(self):
        self.typesense = get_typesense_client()
        self.extractor = get_extractor()
        self._stop_event = asyncio.Event()

    def stop(self):
        """Signal the indexing process to stop."""
        self._stop_event.set()

    async def index_file(self, operation: CrawlOperation) -> bool:
        """
        Index a single file.
        """
        if self._stop_event.is_set():
            return False

        if operation.operation == OperationType.DELETE:
            return await self._handle_delete_operation(operation)
        else:
            return await self._handle_create_edit_operation(operation)

    async def _handle_create_edit_operation(self, operation: CrawlOperation) -> bool:
        file_path = operation.file_path

        if not self._check_file_accessibility(file_path)[0]:
            logger.warning(f"File not accessible: {file_path}")
            return False

        max_size_mb = int(os.getenv("MAX_FILE_SIZE_MB", "100"))
        max_size_bytes = max_size_mb * 1024 * 1024
        if operation.file_size and operation.file_size > max_size_bytes:
            logger.warning(f"File too large: {file_path}")
            return False

        file_hash = await self._calculate_file_hash(file_path)
        if not file_hash:
            return False

        existing_doc = await self.typesense.get_doc_by_path(file_path)
        if existing_doc and existing_doc.get("file_hash") == file_hash:
            logger.debug(f"Skipping unchanged file: {file_path}")
            return True

        # Extract document content
        document_content = self.extractor.extract(file_path)

        # Import chunking utilities
        from services.chunker import chunk_text, generate_chunk_hash, get_chunk_config

        # Get chunking configuration
        chunk_size, overlap = get_chunk_config()

        # Split content into chunks
        content_chunks = chunk_text(document_content.content, chunk_size, overlap)
        total_chunks = len(content_chunks)

        logger.info(f"Indexing {file_path} as {total_chunks} chunk(s)")

        # Index each chunk
        for chunk_index, chunk_content in enumerate(content_chunks):
            chunk_hash = generate_chunk_hash(file_path, chunk_index, chunk_content)

            # Essential metadata for ALL chunks (for UI display)
            essential_metadata = {
                "file_path": file_path,
                "content": chunk_content,
                "chunk_index": chunk_index,
                "chunk_total": total_chunks,
                "chunk_hash": chunk_hash,
                "file_extension": Path(file_path).suffix.lower(),
                "file_size": operation.file_size,
                "mime_type": mimetypes.guess_type(file_path)[0] or "application/octet-stream",
                "modified_time": int(operation.modified_time) if operation.modified_time is not None else None,
            }

            # Only chunk 0 gets additional metadata
            if chunk_index == 0:
                await self.typesense.index_file(
                    **essential_metadata,
                    # Additional metadata only in chunk 0
                    created_time=int(operation.created_time) if operation.created_time is not None else None,
                    file_hash=file_hash,
                    metadata=document_content.metadata,
                )
            else:
                # Other chunks: only essential metadata
                await self.typesense.index_file(**essential_metadata)

        return True

    async def _handle_delete_operation(self, operation: CrawlOperation) -> bool:
        try:
            await self.typesense.remove_from_index(operation.file_path)
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

    async def _calculate_file_hash(self, file_path: str) -> str:
        loop = asyncio.get_running_loop()

        def _hash():
            try:
                hash_md5 = hashlib.md5()
                with open(file_path, "rb") as f:
                    for chunk in iter(lambda: f.read(4096), b""):
                        hash_md5.update(chunk)
                return hash_md5.hexdigest()
            except Exception as e:
                logger.error(f"Error calculating file hash for {file_path}: {e}")
                return ""

        return await loop.run_in_executor(None, _hash)
