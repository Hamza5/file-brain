"""
Index Verification Service
"""

import asyncio
import os
from dataclasses import dataclass
from typing import Optional

from core.logging import logger
from database.models import get_db
from database.repositories import WatchPathRepository
from services.typesense_client import get_typesense_client


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

            # 2. Get watch paths configuration
            db = next(get_db())
            try:
                watch_path_repo = WatchPathRepository(db)
                watch_paths = watch_path_repo.get_enabled()

                included_paths = [wp for wp in watch_paths if not wp.is_excluded]
                excluded_paths = [os.path.normpath(wp.path) for wp in watch_paths if wp.is_excluded]
            finally:
                db.close()

            # 3. Iterate through index in batches
            batch_size = 100
            offset = 0

            while offset < total_count:
                if self._stop_event.is_set():
                    break

                # Fetch batch of documents
                documents = await self.typesense.get_all_indexed_files(limit=batch_size, offset=offset)

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

                    # 1. Check if file exists
                    if not os.path.exists(file_path):
                        orphaned_ids.append(doc.get("id"))
                        orphaned_paths.append(file_path)
                        self.progress.orphaned_count += 1
                        logger.debug(f"Found orphaned file (missing): {file_path}")
                        continue

                    # 2. Check if file is still in a valid watch path
                    # We need to re-fetch watch paths occasionally or just once at start?
                    # Since this is a long running job, things might change, but for now fetch at start is fine
                    # Actually, we should fetch inside the method to be fresh

                    # Optimization: Move this fetch outside the loop if performance is major concern,
                    # but for now let's adhere to "simple is better" and maybe just pass it in?
                    # No, let's fetch it at the start of verify_index using a temporary session

                    # ... Wait, I can't easily get a session here without changing the signature or init.
                    # Let's assume we do it at start of verify_index.

                    # For current strict instruction implementation:
                    is_valid_path = False
                    norm_file_path = os.path.normpath(str(file_path))

                    # Check inclusion
                    for wp in included_paths:
                        wp_path = os.path.normpath(wp.path)
                        if norm_file_path.startswith(wp_path):
                            # It is inside an included path. Now check exclusion.
                            is_excluded_file = False
                            for exp in excluded_paths:
                                if norm_file_path == exp or norm_file_path.startswith(exp + os.sep):
                                    is_excluded_file = True
                                    break

                            if not is_excluded_file:
                                is_valid_path = True
                            break

                    if not is_valid_path:
                        orphaned_ids.append(doc.get("id"))
                        orphaned_paths.append(file_path)
                        self.progress.orphaned_count += 1
                        logger.debug(f"Found orphaned file (excluded/no-watch): {file_path}")

                # 3. Batch delete orphaned files
                if orphaned_ids:
                    logger.info(f"Removing {len(orphaned_ids)} orphaned files from index...")
                    # We can use the client to delete by ID or by path.
                    # typeense_client.batch_remove_files takes paths.
                    await self.typesense.batch_remove_files(orphaned_paths)

                offset += len(documents)

                # Yield control to event loop
                await asyncio.sleep(0.01)

            self.progress.is_complete = True
            logger.info(
                f"Index verification completed. Processed: {self.progress.processed_count}, "
                f"Orphans removed: {self.progress.orphaned_count}"
            )

        except Exception as e:
            logger.error(f"Error during index verification: {e}")
            self.progress.verification_errors += 1
            raise
