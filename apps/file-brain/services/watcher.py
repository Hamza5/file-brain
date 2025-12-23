"""
FileWatcher integration for CrawlJobManager
Converts file events to operations for the operation queue system
"""
import asyncio
import time
import os
from typing import Callable, List
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler, FileModifiedEvent, FileCreatedEvent, FileDeletedEvent, DirModifiedEvent, DirCreatedEvent, DirDeletedEvent
from api.models.file_event import FileDiscoveredEvent, FileChangedEvent, FileDeletedEvent
from api.models.operations import CrawlOperation, OperationType
from utils.logger import logger


class FileWatcher:
    """
    FileWatcher wrapper using watchdog library
    """
    
    def __init__(
        self,
        on_file_event: Callable,
        watch_paths: List[str],
        excluded_patterns: List[str] = None
    ):
        self.on_file_event = on_file_event
        self.watch_paths = watch_paths
        self.excluded_patterns = excluded_patterns or []
        self.observer = Observer()
        self._running = False
        
        # Create event handler
        self.event_handler = CrawlEventHandler(on_file_event)
        
        # Schedule watches
        for path in watch_paths:
            if os.path.exists(path):
                self.observer.schedule(
                    self.event_handler,
                    path,
                    recursive=True
                )
    
    def start(self):
        """Start the file watcher"""
        if not self._running:
            self.observer.start()
            self._running = True
            logger.info(f"FileWatcher started for paths: {self.watch_paths}")
    
    def stop(self):
        """Stop the file watcher"""
        if self._running:
            self.observer.stop()
            self.observer.join()
            self._running = False
            logger.info("FileWatcher stopped")
    
    def is_running(self) -> bool:
        """Check if watcher is running"""
        return self._running and self.observer.is_alive()


class CrawlEventHandler(FileSystemEventHandler):
    """
    Event handler that converts watchdog events to crawl operations.

    This handler runs in the watchdog thread. It must NEVER try to create
    or access an asyncio loop directly. Instead, it forwards events to the
    provided callback, which is responsible for marshalling into the main
    asyncio loop.
    """
    
    def __init__(self, on_file_event: Callable):
        # on_file_event is a plain callable invoked from the watchdog thread.
        # It must be thread-safe and handle scheduling work into the asyncio loop.
        self.on_file_event = on_file_event
        self._processing = set()
    
    def on_created(self, event):
        """Handle file/folder creation events"""
        if event.is_directory:
            return  # Skip directory creation for now
        
        self._handle_file_event(FileDiscoveredEvent(
            file_path=event.src_path,
            timestamp=int(time.time() * 1000),
            file_size=0,  # Will be filled by OperationEventHandler
            modified_time=0,  # Will be filled by OperationEventHandler
            created_time=int(time.time() * 1000)
        ))
    
    def on_modified(self, event):
        """Handle file modification events"""
        if event.is_directory:
            return  # Skip directory modification
        
        self._handle_file_event(FileChangedEvent(
            file_path=event.src_path,
            timestamp=int(time.time() * 1000),
            file_size=0,  # Will be filled by OperationEventHandler
            modified_time=int(time.time() * 1000)
        ))
    
    def on_deleted(self, event):
        """Handle file/folder deletion events"""
        if event.is_directory:
            return  # Skip directory deletion for now
        
        self._handle_file_event(FileDeletedEvent(
            file_path=event.src_path,
            timestamp=int(time.time() * 1000)
        ))
    
    def _handle_file_event(self, event):
        """
        Handle file event by calling the provided callback.

        All asyncio integration is delegated to the callback, which is
        expected to use loop.call_soon_threadsafe(...) or similar.
        """
        try:
            self.on_file_event(event)
        except Exception as e:
            logger.error(f"Error handling file event for {getattr(event, 'file_path', getattr(event, 'src_path', 'unknown'))}: {e}")


class OperationEventHandler:
    """
    Converts file events to operations and enqueues them
    """
    
    def __init__(self, operation_queue: asyncio.Queue):
        self.operation_queue = operation_queue
        self._processing = set()
    
    async def handle_file_event(self, event) -> None:
        """
        Handle file system events by converting them to operations
        """
        if hasattr(event, 'file_path'):
            # Already an operation
            if isinstance(event, CrawlOperation):
                await self._enqueue_operation(event)
            return
        
        # Convert file events to operations
        file_path = getattr(event, 'src_path', None)
        if not file_path or file_path in self._processing:
            return
        
        self._processing.add(file_path)
        
        try:
            if isinstance(event, FileCreatedEvent):
                # Check if file exists (might have been deleted already)
                if os.path.exists(file_path):
                    stats = os.stat(file_path)
                    operation = CrawlOperation(
                        operation=OperationType.CREATE,
                        file_path=file_path,
                        file_size=stats.st_size,
                        modified_time=int(stats.st_mtime * 1000),
                        created_time=int(stats.st_ctime * 1000),
                        discovered_at=int(time.time() * 1000),
                        source="watch"
                    )
                    await self._enqueue_operation(operation)
                    logger.debug(f"📄 File created (watch): {file_path}")
                
            elif isinstance(event, FileModifiedEvent):
                # Check if file still exists
                if os.path.exists(file_path):
                    stats = os.stat(file_path)
                    operation = CrawlOperation(
                        operation=OperationType.EDIT,
                        file_path=file_path,
                        file_size=stats.st_size,
                        modified_time=int(stats.st_mtime * 1000),
                        source="watch"
                    )
                    await self._enqueue_operation(operation)
                    logger.debug(f"✏️ File modified (watch): {file_path}")
                
            elif isinstance(event, FileDeletedEvent):
                # Skip if file still exists (race condition with API deletion)
                if os.path.exists(file_path):
                    logger.debug(f"Skipping delete event for existing file: {file_path}")
                    return
                    
                operation = CrawlOperation(
                    operation=OperationType.DELETE,
                    file_path=file_path,
                    source="watch"
                )
                await self._enqueue_operation(operation)
                logger.debug(f"🗑️ File deleted (watch): {file_path}")
        except Exception as e:
            logger.error(f"Error handling file event for {file_path}: {e}")
        finally:
            self._processing.discard(file_path)
    
    async def _enqueue_operation(self, operation: CrawlOperation) -> None:
        """
        Enqueue operation with retry logic
        """
        max_retries = 3
        retry_count = 0
        
        while retry_count < max_retries:
            try:
                # Add to queue with timeout
                await asyncio.wait_for(
                    self.operation_queue.put(operation),
                    timeout=1.0
                )
                return
            except asyncio.TimeoutError:
                retry_count += 1
                if retry_count < max_retries:
                    logger.warning(f"Queue full, retrying operation for {operation.file_path}")
                    await asyncio.sleep(0.1)
                else:
                    logger.error(f"Failed to enqueue operation after {max_retries} retries: {operation.file_path}")
                    break


def create_watcher_for_crawl(
    watch_paths: List[str],
    operation_queue: asyncio.Queue,
    excluded_patterns: List[str] = None
) -> tuple[FileWatcher, OperationEventHandler]:
    """
    Create a FileWatcher configured for the crawl job
    
    Args:
        watch_paths: Paths to watch
        operation_queue: Queue to enqueue operations
        excluded_patterns: Patterns to exclude
        
    Returns:
        Tuple of (FileWatcher, OperationEventHandler)
    """
    excluded_patterns = excluded_patterns or []
    
    # Create event handler that enqueues operations into the shared asyncio.Queue
    event_handler = OperationEventHandler(operation_queue)

    # Capture the running asyncio loop at watcher creation time.
    # This must be called from within the main event loop (as done by CrawlJobManager).
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError as e:
        # Fallback/logging: this should not happen in normal flow.
        logger.error(f"create_watcher_for_crawl must be called from within an async context: {e}")
        raise

    def on_file_event(event):
        """
        Thread-safe callback invoked from the watchdog thread.

        It schedules the async OperationEventHandler.handle_file_event coroutine
        onto the main asyncio loop without blocking the watcher thread.
        """
        try:
            loop.call_soon_threadsafe(
                lambda: asyncio.create_task(event_handler.handle_file_event(event))
            )
        except Exception as exc:
            logger.error(f"Failed to schedule file event for {getattr(event, 'src_path', None)}: {exc}")

    watcher = FileWatcher(
        on_file_event=on_file_event,
        watch_paths=watch_paths,
        excluded_patterns=excluded_patterns
    )
    
    return watcher, event_handler