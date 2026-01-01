"""
File Discoverer component
"""
import os
import asyncio
import time
from typing import List
from pathlib import Path

from database.models import WatchPath
from api.models.operations import CrawlOperation, OperationType
from core.logging import logger

class FileDiscoverer:
    """
    Scans watch paths for files and yields crawl operations.
    """
    def __init__(self, watch_paths: List[WatchPath]):
        self.watch_paths = watch_paths
        self._stop_event = asyncio.Event()
        self._sync_stop_event = False # Used for thread-safe stopping
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

        def scan_worker():
            """Blocking filesystem traversal run in a thread"""
            try:
                for watch_path_model in self.watch_paths:
                    if self._sync_stop_event:
                        break
                    
                    logger.info(f"Scanning directory: {watch_path_model.path}")
                    for root, dirs, files in os.walk(watch_path_model.path, topdown=True):
                        if self._sync_stop_event:
                            return
                            
                        if not watch_path_model.include_subdirectories:
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