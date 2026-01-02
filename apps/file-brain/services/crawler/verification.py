"""
Index Verification Service
"""

import asyncio
import os
from dataclasses import dataclass
from typing import Optional

from services.typesense_client import get_typesense_client
from core.logging import logger


@dataclass
class VerificationProgress:
    """Progress tracking for index verification"""

    total_indexed: int = 0
    processed_count: int = 0
    orphaned_count: int = 0
    verification_errors: int = 0
    current_file: Optional[str] = None
    is_complete: bool = False


class IndexVerifier:
    """
    Verifies that all indexed files still exist on the filesystem.
    Removes orphaned entries.
    """

    def __init__(self):
        self.typesense = get_typesense_client()
        self._stop_event = asyncio.Event()
        self.progress = VerificationProgress()

    def stop(self):
        """Signal the verification process to stop."""
        self._stop_event.set()

    async def verify_index(self):
        """
        Iterate through all indexed files and verify their existence.
        Yields progress updates.
        """
        try:
            # 1. Get total count for progress tracking
            total_count = await self.typesense.get_indexed_files_count()
            self.progress.total_indexed = total_count

            if total_count == 0:
                self.progress.is_complete = True
                return

            logger.info(f"Starting index verification for {total_count} files...")

            # 2. Iterate through index in batches
            batch_size = 100
            offset = 0

            while offset < total_count:
                if self._stop_event.is_set():
                    break

                # Fetch batch of documents
                documents = await self.typesense.get_all_indexed_files(
                    limit=batch_size, offset=offset
                )

                if not documents:
                    break

                orphaned_ids = []
                orphaned_paths = []

                for doc in documents:
                    if self._stop_event.is_set():
                        break

                    file_path = doc.get("file_path")
                    if not file_path:
                        continue

                    self.progress.current_file = file_path
                    self.progress.processed_count += 1

                    # Check if file exists
                    if not os.path.exists(file_path):
                        orphaned_ids.append(doc.get("id"))
                        orphaned_paths.append(file_path)
                        self.progress.orphaned_count += 1
                        logger.debug(f"Found orphaned file: {file_path}")

                # 3. Batch delete orphaned files
                if orphaned_ids:
                    logger.info(
                        f"Removing {len(orphaned_ids)} orphaned files from index..."
                    )
                    # We can use the client to delete by ID or by path.
                    # typeense_client.batch_remove_files takes paths.
                    await self.typesense.batch_remove_files(orphaned_paths)

                offset += len(documents)

                # Yield control to event loop
                await asyncio.sleep(0.01)

            self.progress.is_complete = True
            logger.info(
                f"Index verification completed. Processed: {self.progress.processed_count}, Orphans removed: {self.progress.orphaned_count}"
            )

        except Exception as e:
            logger.error(f"Error during index verification: {e}")
            self.progress.verification_errors += 1
            raise
