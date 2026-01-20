"""
File Monitor Service using Watchdog
"""

import os
import time
from typing import List

from watchdog.events import (
    FileCreatedEvent,
    FileDeletedEvent,
    FileModifiedEvent,
    FileMovedEvent,
    FileSystemEvent,
    FileSystemEventHandler,
)
from watchdog.observers import Observer

from file_brain.api.models.operations import CrawlOperation, OperationType
from file_brain.core.logging import logger
from file_brain.database.models import WatchPath
from file_brain.services.crawler.path_utils import PathFilter
from file_brain.services.crawler.queue import DedupQueue


class FileEventHandler(FileSystemEventHandler):
    """
    Handles file system events and triggers indexing updates via queue.
    """

    def __init__(
        self,
        queue: DedupQueue[CrawlOperation],
        path_filter: PathFilter,
    ):
        self.queue = queue
        self.path_filter = path_filter
        self.last_event_time = {}
        self.cooldown_seconds = 1.0  # Debounce interval

    def _process_event(self, event: FileSystemEvent, event_type: str):
        if event.is_directory:
            return

        file_path = event.src_path

        # Check exclusion using shared PathFilter
        if self.path_filter.is_excluded(file_path):
            logger.debug(f"Ignoring event in excluded path: {file_path}")
            return

        # Debounce rapid firing events
        current_time = time.time()
        last_time = self.last_event_time.get(file_path, 0)
        if current_time - last_time < self.cooldown_seconds:
            return

        self.last_event_time[file_path] = current_time

        logger.debug(f"File event {event_type}: {file_path}")

        try:
            if event_type == "deleted":
                operation = CrawlOperation(operation=OperationType.DELETE, file_path=file_path, source="watch")
                self.queue.put(file_path, operation)
            else:
                target_path = file_path
                if isinstance(event, FileMovedEvent):
                    target_path = event.dest_path
                    # Also handle the old path as delete
                    old_path_op = CrawlOperation(operation=OperationType.DELETE, file_path=file_path, source="watch")
                    self.queue.put(file_path, old_path_op)

                if os.path.exists(target_path):
                    # Construct operation for new/modified file
                    # We can't easily get size/times here without blocking,
                    # but FileIndexer.index_file handles string payloads calling os.stat.
                    # However, best to form proper operation if possible.
                    # Let's pass the string path to queue if we want, or construct basic op.
                    # Indexer accepts str and converts it.
                    # But DedupQueue needs keys.
                    # Let's construct a basic CrawlOperation and let Indexer refine it?
                    # Actually, Indexer logic to "stat" the file is good.
                    # But we are in a thread here. Calling os.stat is fine.
                    try:
                        stat = os.stat(target_path)
                        operation = CrawlOperation(
                            operation=OperationType.EDIT,
                            file_path=target_path,
                            file_size=stat.st_size,
                            modified_time=int(stat.st_mtime * 1000),
                            created_time=int(stat.st_ctime * 1000),
                            source="watch",
                        )
                        self.queue.put(target_path, operation)
                    except Exception as e:
                        logger.warning(f"Failed to stat file {target_path}: {e}")

        except Exception as e:
            logger.error(f"Error processing file event {event_type} for {file_path}: {e}")

    def on_created(self, event: FileCreatedEvent):
        self._process_event(event, "created")

    def on_deleted(self, event: FileDeletedEvent):
        self._process_event(event, "deleted")

    def on_modified(self, event: FileModifiedEvent):
        # IMPORTANT: Accessing a file for read (like the crawler does) updates access time
        # which might trigger modified events on some systems/configs.
        # However, watchdog's 'modified' usually generally refers to content modification.
        # To be safe and avoid loops:
        # We rely on the debounce and the fact that we are only reading.
        self._process_event(event, "modified")

    def on_moved(self, event: FileMovedEvent):
        self._process_event(event, "moved")


class FileMonitorService:
    """
    Manages the Watchdog observer and event handling.
    """

    def __init__(self, queue: DedupQueue[CrawlOperation]):
        self.observer = None
        self.queue = queue
        self.handler: FileEventHandler | None = None
        self.watches = {}
        self.is_active = False

    def start(self, watch_paths: List[WatchPath]):
        """Start monitoring the specified paths"""
        if self.is_active:
            self.stop()

        self.observer = Observer()
        self.watches = {}

        # Separate included and excluded
        included_paths = [wp for wp in watch_paths if not wp.is_excluded]
        excluded_paths = [wp.path for wp in watch_paths if wp.is_excluded]

        # Create shared path filter
        path_filter = PathFilter(
            included_paths=[wp.path for wp in included_paths],
            excluded_paths=excluded_paths,
        )

        self.handler = FileEventHandler(self.queue, path_filter=path_filter)

        success_count = 0
        for wp in included_paths:
            if os.path.isdir(wp.path):
                try:
                    # Recursive watch
                    watch = self.observer.schedule(self.handler, wp.path, recursive=wp.include_subdirectories)
                    self.watches[wp.path] = watch
                    success_count += 1
                    logger.info(f"Started monitoring: {wp.path}")
                except Exception as e:
                    logger.error(f"Failed to watch path {wp.path}: {e}")

        if success_count > 0:
            self.observer.start()
            self.is_active = True
            logger.info(f"File monitor service started with {success_count} paths.")
        else:
            logger.warning("No valid paths to monitor.")

    def stop(self):
        """Stop monitoring"""
        if self.observer:
            self.observer.stop()
            self.observer.join()
            self.observer = None
            self.watches = {}
            self.handler = None

        self.is_active = False
        logger.info("File monitor service stopped.")

    def is_running(self) -> bool:
        return self.is_active
