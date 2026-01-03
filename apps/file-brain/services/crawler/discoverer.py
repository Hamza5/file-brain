"""
File Discoverer component
"""

import asyncio
import os
import time
from typing import List

from api.models.operations import CrawlOperation, OperationType
from core.logging import logger
from database.models import WatchPath


class FileDiscoverer:
    """
    Scans watch paths for files and yields crawl operations.
    """

    def __init__(self, watch_paths: List[WatchPath]):
        self.watch_paths = watch_paths
        self._stop_event = asyncio.Event()
        self._sync_stop_event = False  # Used for thread-safe stopping
        self.files_found = 0

    def stop(self):
        """Signal the discovery process to stop."""
        self._stop_event.set()
        self._sync_stop_event = True

    async def discover(self):
        """
        Discover files in watch paths and yield crawl operations.
        Uses a thread pool and async queue for non-blocking traversal.
        """
        queue = asyncio.Queue(maxsize=1000)
        loop = asyncio.get_running_loop()

        # Separate included and excluded paths
        included_paths = [wp for wp in self.watch_paths if not wp.is_excluded]
        excluded_paths = [os.path.normpath(wp.path) for wp in self.watch_paths if wp.is_excluded]

        def is_excluded(path: str) -> bool:
            norm_path = os.path.normpath(path)
            for excluded in excluded_paths:
                # Check if path is the excluded path or inside it
                if norm_path == excluded or norm_path.startswith(excluded + os.sep):
                    return True
            return False

        def scan_worker():
            """Blocking filesystem traversal run in a thread"""
            try:
                for watch_path_model in included_paths:
                    if self._sync_stop_event:
                        break

                    if not os.path.exists(watch_path_model.path):
                        continue

                    logger.info(f"Scanning directory: {watch_path_model.path}")
                    for root, dirs, files in os.walk(watch_path_model.path, topdown=True):
                        if self._sync_stop_event:
                            return

                        # Prune excluded directories
                        # We modify dirs in-place to prevent os.walk from visiting them
                        dirs[:] = [d for d in dirs if not is_excluded(os.path.join(root, d))]

                        if not watch_path_model.include_subdirectories:
                            # If not recursive, we still want to process files in root,
                            # but we clear dirs so we don't go deeper.
                            # We already checked for exclusions above, now check recursion setting.
                            # Note: The original code cleared dirs[:] immediately.
                            # We should probably do that AFTER pruning, effectively clearing it anyway.
                            dirs[:] = []

                        for filename in files:
                            if self._sync_stop_event:
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
                                # Use thread-safe way to put into async queue
                                # We use .result() to provide backpressure: if the queue is full, the thread will wait
                                asyncio.run_coroutine_threadsafe(queue.put(op), loop).result()
                            except FileNotFoundError:
                                continue
                            except Exception as e:
                                logger.warning(f"Error processing {file_path}: {e}")
            finally:
                # Signal end of discovery
                asyncio.run_coroutine_threadsafe(queue.put(None), loop)

        # Start scanning in background thread
        scan_task = loop.run_in_executor(None, scan_worker)

        # Yield items as they arrive
        while True:
            item = await queue.get()
            if item is None:
                break
            yield item
            queue.task_done()

        await scan_task
