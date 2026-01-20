"""
Index Verification Service
"""

import os
import threading
import time
from dataclasses import dataclass
from typing import Optional

from file_brain.core.logging import logger
from file_brain.database.models import get_db
from file_brain.database.repositories import WatchPathRepository
from file_brain.services.crawler.path_utils import PathFilter
from file_brain.services.typesense_client import get_typesense_client


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
        self._stop_event = threading.Event()
        self.progress = VerificationProgress()

    def stop(self):
        """Signal the verification process to stop."""
        self._stop_event.set()

    def reset(self):
        """Reset the verifier state for a new crawl."""
        self._stop_event.clear()
        self.progress = VerificationProgress()

    def verify_index(self):
        """
        Iterate through all indexed files and verify their existence.
        Yields progress updates.
        """
        try:
            # 1. Get total count for progress tracking
            total_count = self.typesense.get_indexed_files_count()
            self.progress.total_indexed = total_count

            if total_count == 0:
                self.progress.is_complete = True
                return

            logger.info(f"Starting index verification for {total_count} files...")

            # 2. Get watch paths configuration and create PathFilter
            db = next(get_db())
            try:
                watch_path_repo = WatchPathRepository(db)
                watch_paths = watch_path_repo.get_enabled()

                included_paths = [wp for wp in watch_paths if not wp.is_excluded]
                excluded_paths = [wp.path for wp in watch_paths if wp.is_excluded]

                path_filter = PathFilter(
                    included_paths=[wp.path for wp in included_paths],
                    excluded_paths=excluded_paths,
                )
            finally:
                db.close()

            # 3. Iterate through index in batches
            batch_size = 100
            offset = 0

            while offset < total_count:
                if self._stop_event.is_set():
                    break

                # Fetch batch of documents
                documents = self.typesense.get_all_indexed_files(limit=batch_size, offset=offset)

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

                    # 2. Check if file is still in a valid watch path using PathFilter
                    if not path_filter.is_valid_path(file_path):
                        orphaned_ids.append(doc.get("id"))
                        orphaned_paths.append(file_path)
                        self.progress.orphaned_count += 1
                        logger.debug(f"Found orphaned file (excluded/no-watch): {file_path}")

                # 3. Batch delete orphaned files
                if orphaned_ids:
                    logger.info(f"Removing {len(orphaned_ids)} orphaned files from index...")
                    # We can use the client to delete by ID or by path.
                    # typeense_client.batch_remove_files takes paths.
                    self.typesense.batch_remove_files(orphaned_paths)

                offset += len(documents)

                # Small delay to avoid tight loop
                time.sleep(0.01)

            self.progress.is_complete = True
            logger.info(
                f"Index verification completed. Processed: {self.progress.processed_count}, "
                f"Orphans removed: {self.progress.orphaned_count}"
            )

        except Exception as e:
            logger.error(f"Error during index verification: {e}")
            self.progress.verification_errors += 1
            raise
