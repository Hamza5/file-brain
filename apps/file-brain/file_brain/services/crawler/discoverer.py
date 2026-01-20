"""
File Discoverer component
"""

import os
import queue
import threading
import time
from typing import List

from file_brain.api.models.operations import CrawlOperation, OperationType
from file_brain.core.logging import logger
from file_brain.database.models import WatchPath
from file_brain.services.crawler.path_utils import PathFilter


class FileDiscoverer:
    """
    Scans watch paths for files and yields crawl operations.
    """

    def __init__(self, watch_paths: List[WatchPath]):
        self.watch_paths = watch_paths
        self._stop_event = threading.Event()
        self.files_found = 0

    def stop(self):
        """Signal the discovery process to stop."""
        self._stop_event.set()

    def reset(self):
        """Reset the discoverer state for a new crawl."""
        self._stop_event.clear()
        self.files_found = 0

    def discover(self):
        """
        Discover files in watch paths and yield crawl operations.
        Uses a background thread and queue for non-blocking traversal.
        """
        result_queue = queue.Queue(maxsize=1000)

        # Separate included and excluded paths
        included_paths = [wp for wp in self.watch_paths if not wp.is_excluded]
        excluded_paths = [wp.path for wp in self.watch_paths if wp.is_excluded]

        # Create shared path filter
        path_filter = PathFilter(
            included_paths=[wp.path for wp in included_paths],
            excluded_paths=excluded_paths,
        )

        def scan_worker():
            """Blocking filesystem traversal run in a thread"""
            try:
                for watch_path_model in included_paths:
                    if self._stop_event.is_set():
                        break

                    if not os.path.exists(watch_path_model.path):
                        continue

                    logger.info(f"Scanning directory: {watch_path_model.path}")
                    for root, dirs, files in os.walk(watch_path_model.path, topdown=True):
                        if self._stop_event.is_set():
                            return

                        # Prune excluded directories using shared PathFilter
                        dirs[:] = [d for d in dirs if not path_filter.should_prune_directory(os.path.join(root, d))]

                        if not watch_path_model.include_subdirectories:
                            # If not recursive, clear dirs so we don't go deeper
                            dirs[:] = []

                        for filename in files:
                            if self._stop_event.is_set():
                                return

                            file_path = os.path.join(root, filename)
                            try:
                                stats = os.stat(file_path)
                                self.files_found += 1
                                op = CrawlOperation(
                                    operation=OperationType.CREATE,
                                    file_path=file_path,
                                    file_size=stats.st_size,
                                    modified_time=int(stats.st_mtime * 1000),
                                    created_time=int(stats.st_ctime * 1000),
                                    discovered_at=int(time.time() * 1000),
                                    source="crawl",
                                )
                                # Put into queue (blocking if full for backpressure)
                                result_queue.put(op)
                            except FileNotFoundError:
                                continue
                            except Exception as e:
                                logger.warning(f"Error processing {file_path}: {e}")
            finally:
                # Signal end of discovery
                result_queue.put(None)

        # Start scanning in background thread
        scan_thread = threading.Thread(target=scan_worker, daemon=True, name="file_discoverer")
        scan_thread.start()

        # Yield items as they arrive
        while True:
            item = result_queue.get()
            if item is None:
                break
            yield item
            result_queue.task_done()

        # Wait for thread to complete
        scan_thread.join(timeout=1.0)
