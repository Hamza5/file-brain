"""
CrawlJobManager with File Monitoring Integration
"""
import os
import hashlib
import mimetypes
import asyncio
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Optional, Dict, Any, Callable
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass

from database.models import SessionLocal, CrawlerState, WatchPath
from services.database_service import DatabaseService
from services.typesense_client import get_typesense_client
from services.watcher import create_watcher_for_crawl
from services.extractor import get_extractor
from api.models.operations import CrawlOperation, OperationType, BatchOperation
from api.models.file_event import FileDiscoveredEvent, FileChangedEvent, FileDeletedEvent
from utils.logger import logger


@dataclass
class DiscoveryProgress:
    """Progress tracking for file discovery"""
    total_paths: int
    processed_paths: int
    files_found: int
    files_skipped: int
    current_path: Optional[str] = None
    start_time: Optional[float] = None


@dataclass
class IndexingProgress:
    """Progress tracking for file indexing"""
    files_to_index: int
    files_indexed: int
    files_failed: int
    current_file: Optional[str] = None
    start_time: Optional[float] = None


class CrawlJobManager:
    """
    Crawl job manager with file monitoring integration
    """
    
    def __init__(self):
        self._running = False
        self._crawl_task: Optional[asyncio.Task] = None
        self._discovery_task: Optional[asyncio.Task] = None
        self._indexing_task: Optional[asyncio.Task] = None
        
        
        # Progress tracking
        self.discovery_progress = DiscoveryProgress(0, 0, 0, 0)
        self.indexing_progress = IndexingProgress(0, 0, 0)
        
        # Components
        self.typesense = get_typesense_client()
        self.extractor = get_extractor()
        self._operation_queue: asyncio.Queue = asyncio.Queue(maxsize=1000)
        self._watcher = None

        # Thread pool for blocking/CPU-heavy work (hashing, extraction, Typesense calls)
        # Keeping this bounded ensures predictable behavior under load.
        max_workers = int(os.getenv("CRAWLER_WORKERS", "4"))
        self._thread_pool = ThreadPoolExecutor(max_workers=max_workers)

        # Stop event for graceful shutdown and cooperative cancellation
        self._stop_event = asyncio.Event()
    
    async def start_crawl(
        self,
        watch_paths: List['WatchPath'],
        start_monitoring: bool = True,
    ) -> bool:
        """
        Start the crawl job with parallel discovery, indexing, and monitoring.

        Responsiveness notes:
        - All heavy work (hashing, extraction, Typesense calls) is executed in a
          bounded ThreadPoolExecutor via _run_in_executor().
        - This keeps the asyncio event loop free so /status and /stop endpoints
          remain responsive even under heavy load.

        Args:
            watch_paths: List of paths to crawl (fetched from database)
            start_monitoring: Whether to start file monitoring (from database settings)
            include_subdirectories: Whether to include subdirectories (from database settings)
        """
        if self._running:
            logger.warning("Crawl job already running")
            return False
        
        path_strs = [wp.path for wp in watch_paths]
        logger.info(f"Starting crawl job for {len(path_strs)} paths")
        logger.info(f"Watch paths: {path_strs}")
        logger.info(f"File monitoring: {'enabled' if start_monitoring else 'disabled'}")
        
        self._running = True
        self._stop_event.clear()
        
        # Update database state
        db = SessionLocal()
        try:
            db_service = DatabaseService(db)
            db_service.update_crawler_state(
                crawl_job_running=True,
                crawl_job_type="crawl+monitor" if start_monitoring else "crawl",
                crawl_job_started_at=datetime.utcnow(),
                discovery_progress=0,
                indexing_progress=0,
                files_discovered=0,
                files_indexed=0,
                files_skipped=0,
                estimated_total_files=0,
                watcher_running=start_monitoring,
            )
        finally:
            db.close()
        
        # Start file monitoring if requested
        if start_monitoring:
            await self._start_file_monitoring(path_strs)
        
        # Start the main crawl task
        self._crawl_task = asyncio.create_task(self._run_crawl_job(watch_paths))
        
        return True
    
    async def stop_crawl(self) -> bool:
        """
        Stop the current crawl job and file monitoring.

        Design goals:
        - Be responsive: return soon after stop is requested.
        - Cooperatively cancel discovery and indexing loops.
        - Avoid starting new work once stop is signaled.
        """
        if not self._running:
            logger.warning("No crawl job running")
            return False

        logger.info("Stopping crawl job and file monitoring...")
 
        # Signal stop to all tasks early so that long-running loops can exit.
        # This is the critical point: /stop returns based on this coordination,
        # not on all heavy work finishing.
        self._stop_event.set()
 
        # Stop file monitoring first so no new watch events are enqueued.
        await self._stop_file_monitoring()
 
        # Cancel running tasks to interrupt awaits promptly.
        for task in (self._crawl_task, self._discovery_task, self._indexing_task):
            if task and not task.done():
                task.cancel()
 
        # Wait for tasks to react to cancellation; swallow CancelledError.
        # Heavy synchronous work is offloaded to the thread pool, so this await
        # should complete quickly instead of blocking on large file processing.
        tasks_to_wait = [t for t in (self._crawl_task, self._discovery_task, self._indexing_task) if t]
        if tasks_to_wait:
            await asyncio.gather(*tasks_to_wait, return_exceptions=True)

        # Clear references so future runs start cleanly.
        self._crawl_task = None
        self._discovery_task = None
        self._indexing_task = None

        # Update database state
        db = SessionLocal()
        try:
            db_service = DatabaseService(db)
            db_service.update_crawler_state(
                crawl_job_running=False,
                crawl_job_type=None,
                crawl_job_started_at=None,
                watcher_running=False,
            )
        finally:
            db.close()

        self._running = False
        logger.info("Crawl job and monitoring stopped")

        return True
    
    def is_running(self) -> bool:
        """Check if crawl job is currently running"""
        return self._running
    
    def get_status(self) -> Dict[str, Any]:
        """
        Get current crawl status and progress.

        Semantics:
        - indexing_progress reflects both initial crawl and any queued operations.
        - indexing_progress reaches 100 ONLY when there is no pending work (queue_size == 0)
          and all known operations have been processed (success/failed).
        """
        # If manager is not running, expose an idle status
        if not self._running:
            return {
                "running": False,
                "job_type": None,
                "start_time": None,
                "elapsed_time": None,
                "discovery_progress": 0,
                "indexing_progress": 0,
                "files_discovered": 0,
                "files_indexed": 0,
                "files_skipped": 0,
                "queue_size": 0,
                "monitoring_active": False,
                "estimated_completion": None,
            }

        # Load persisted state for authoritative timestamps and job_type
        db = SessionLocal()
        try:
            db_service = DatabaseService(db)
            state = db_service.get_crawler_state()
            start_time = state.crawl_job_started_at
            job_type = state.crawl_job_type or "crawl+monitor"
        finally:
            db.close()

        # Elapsed time based on DB start time (if available)
        if start_time:
            elapsed_time = (datetime.utcnow() - start_time).total_seconds()
        else:
            elapsed_time = None

        # In-memory metrics
        discovered = self.discovery_progress.files_found
        skipped = self.discovery_progress.files_skipped
        queue_size = self._operation_queue.qsize()
        indexed_success = self.indexing_progress.files_indexed
        indexed_failed = self.indexing_progress.files_failed
        completed = indexed_success + indexed_failed

        # Discovery progress (paths-based as before, clamped)
        if self.discovery_progress.total_paths > 0:
            discovery_progress = int(
                (self.discovery_progress.processed_paths / max(1, self.discovery_progress.total_paths)) * 100
            )
            discovery_progress = max(0, min(discovery_progress, 100))
        else:
            discovery_progress = 0

        # Total known operations:
        # - For initial crawl: approximated by discovered
        # - With monitoring: also consider completed + queued so progress never exceeds reality
        total_known_ops = max(discovered, completed + queue_size)

        # Compute indexing progress against all known work
        if total_known_ops == 0:
            indexing_progress = 0
        else:
            indexing_progress = int((completed / total_known_ops) * 100)
            indexing_progress = max(0, min(indexing_progress, 100))

        # Enforce invariant: if there is pending work, never show 100%
        if queue_size > 0 and indexing_progress >= 100:
            indexing_progress = 99

        # Estimated completion:
        # Only when we have some completed work and there is outstanding work
        estimated_completion = None
        remaining = total_known_ops - completed
        if (
            elapsed_time
            and elapsed_time > 0
            and completed > 0
            and remaining > 0
        ):
            # Simple linear estimate based on current throughput
            throughput = completed / elapsed_time  # ops per second
            if throughput > 0:
                remaining_time = remaining / throughput
                estimated_completion_dt = datetime.utcnow() + timedelta(seconds=remaining_time)
                estimated_completion = int(estimated_completion_dt.timestamp() * 1000)

        # Monitoring flag from watcher
        monitoring_active = self._watcher is not None and self._watcher.is_running()

        # Log suspicious situations for debugging progress correctness
        if indexing_progress == 100 and (queue_size > 0 or remaining > 0):
            logger.warning(
                "Inconsistent progress state detected in get_status: "
                f"indexing_progress=100, queue_size={queue_size}, "
                f"completed={completed}, total_known_ops={total_known_ops}"
            )

        return {
            "running": True,
            "job_type": job_type,
            "start_time": int(start_time.timestamp() * 1000) if start_time else None,
            "elapsed_time": int(elapsed_time) if elapsed_time is not None else None,
            "discovery_progress": discovery_progress,
            "indexing_progress": indexing_progress,
            "files_discovered": discovered,
            "files_indexed": indexed_success,
            "files_skipped": skipped,
            "queue_size": queue_size,
            "monitoring_active": monitoring_active,
            "estimated_completion": estimated_completion,
        }
    
    async def clear_indexes(self) -> bool:
        """Clear all files from Typesense and reset statistics"""
        logger.info("Clearing all indexes...")
        
        try:
            # Clear Typesense collection
            await self.typesense.clear_all_documents()
            
            # Reset statistics
            db = SessionLocal()
            try:
                db_service = DatabaseService(db)
                db_service.reset_stats()
            finally:
                db.close()
            
            logger.info("All indexes cleared successfully")
            return True
            
        except Exception as e:
            logger.error(f"Error clearing indexes: {e}")
            return False
    
    async def _start_file_monitoring(self, watch_paths: List[str]) -> None:
        """
        Start file monitoring for real-time changes
        """
        try:
            logger.info(f"Starting file monitoring for: {watch_paths}")
            
            # Create integrated watcher
            self._watcher, _ = create_watcher_for_crawl(
                watch_paths=watch_paths,
                operation_queue=self._operation_queue,
                excluded_patterns=[]  # Remove excluded patterns as requested
            )
            
            # Start watcher in background
            self._watcher.start()
            
            logger.info("File monitoring started successfully")
            
        except Exception as e:
            logger.error(f"Error starting file monitoring: {e}")
            # Continue without monitoring if it fails
            pass
    
    async def _stop_file_monitoring(self) -> None:
        """Stop file monitoring"""
        if self._watcher:
            try:
                logger.info("Stopping file monitoring")
                self._watcher.stop()
                self._watcher = None
                logger.info("File monitoring stopped")
            except Exception as e:
                logger.error(f"Error stopping file monitoring: {e}")
    
    async def _run_crawl_job(self, watch_paths: List['WatchPath']) -> None:
        """Main crawl job coordinator - runs parallel discovery and indexing"""
        try:
            logger.info("Starting parallel file discovery and indexing...")

            # Start parallel discovery and indexing
            self._discovery_task = asyncio.create_task(self._discover_files(watch_paths))
            self._indexing_task = asyncio.create_task(self._index_files())

            # Wait for both to complete or be cancelled
            await asyncio.gather(
                self._discovery_task,
                self._indexing_task,
                return_exceptions=True,
            )

            if not self._stop_event.is_set():
                # Normal completion
                logger.info("Crawl job completed")
            else:
                logger.info("Crawl job cancelled via stop request")
        except Exception as e:
            logger.error(f"Error in crawl job: {e}")
        finally:
            # Ensure we don't falsely report 100% if cancelled early.
            db = SessionLocal()
            try:
                db_service = DatabaseService(db)
                if not self._stop_event.is_set():
                    db_service.update_crawler_state(
                        discovery_progress=100,
                        indexing_progress=100,
                    )
            finally:
                db.close()
    
    async def _run_in_executor(self, func: Callable, *args, **kwargs):
        """
        Run a blocking callable in the shared thread pool.

        This keeps the asyncio event loop responsive for API calls
        (status/stop) while heavy work is offloaded.
        """
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(self._thread_pool, lambda: func(*args, **kwargs))

    async def _discover_files(self, watch_paths: List['WatchPath']) -> None:
        """Discover files in watch paths in parallel.
        
        Discovery is stateless: it enqueues operations for all files found.
        Idempotency and change detection are handled at indexing time via Typesense + file_hash.
        """
        self.discovery_progress = DiscoveryProgress(
            total_paths=len(watch_paths),
            processed_paths=0,
            files_found=0,
            files_skipped=0,
            start_time=time.time()
        )
        
        logger.info(f"Starting file discovery for {len(watch_paths)} paths")
        
        for watch_path_model in watch_paths:
            if self._stop_event.is_set():
                logger.info("Discovery loop detected stop event; exiting early.")
                break

            self.discovery_progress.current_path = watch_path_model.path
            logger.info(f"Discovering files in: {watch_path_model.path}")
            
            try:
                # Discover files in this path
                files_discovered = await self._discover_files_in_path(watch_path_model)
                self.discovery_progress.files_found += files_discovered
            except asyncio.CancelledError:
                logger.info("Discovery task cancelled")
                break
            except Exception as e:
                logger.error(f"Error discovering files in {watch_path_model.path}: {e}")
            
            self.discovery_progress.processed_paths += 1
            
            # Update progress in database
            db = SessionLocal()
            try:
                db_service = DatabaseService(db)
                progress = int(
                    (self.discovery_progress.processed_paths / self.discovery_progress.total_paths) * 100
                )
                db_service.update_crawler_state(
                    discovery_progress=progress,
                    files_discovered=self.discovery_progress.files_found,
                    files_skipped=self.discovery_progress.files_skipped,
                    estimated_total_files=self.discovery_progress.files_found,
                )
            finally:
                db.close()
        
        if not self._stop_event.is_set():
            logger.info(
                f"Discovery complete: {self.discovery_progress.files_found} files found, "
                f"{self.discovery_progress.files_skipped} skipped"
            )
        else:
            logger.info(
                f"Discovery stopped early: {self.discovery_progress.files_found} files found before cancellation, "
                f"{self.discovery_progress.files_skipped} skipped"
            )
     
    async def _discover_files_in_path(self, watch_path_model: 'WatchPath') -> int:
        """Discover files in a single path using thread pool for I/O.
        
        This does not consult Typesense or any local index; it emits operations for all files.
        """
        files_found = 0
        
        try:
            # Use thread pool for file system operations
            loop = asyncio.get_event_loop()
            
            def scan_directory():
                found_files = []
                skipped_files = 0
                
                for root, dirs, files in os.walk(watch_path_model.path):
                    # Skip excluded directories (you can add pattern matching here)
                    dirs[:] = [d for d in dirs if not d.startswith('.')]
                    
                    # Handle subdirectories based on configuration
                    if not watch_path_model.include_subdirectories:
                        # Only process files in the root directory
                        if root != watch_path_model.path:
                            # We're in a subdirectory, so we should skip this branch
                            # by clearing dirs to prevent further recursion
                            dirs[:] = []
                            continue
                    
                    for filename in files:
                        file_path = os.path.join(root, filename)
                        
                        try:
                            # Get file stats
                            stats = os.stat(file_path)
                            
                            # Create operation
                            operation = CrawlOperation(
                                operation=OperationType.CREATE,
                                file_path=file_path,
                                file_size=stats.st_size,
                                modified_time=int(stats.st_mtime * 1000),
                                created_time=int(stats.st_ctime * 1000),
                                discovered_at=int(time.time() * 1000),
                                source="crawl"
                            )
                            
                            found_files.append(operation)
                            
                        except Exception as e:
                            logger.warning(f"Error processing {file_path}: {e}")
                
                return found_files, skipped_files
            
            # Run scan in thread pool
            found_files, skipped_files = await loop.run_in_executor(
                self._thread_pool, scan_directory
            )
            
            # Add files to queue
            for operation in found_files:
                # Respect stop event promptly to avoid flooding queue after stop
                if self._stop_event.is_set():
                    logger.info("Stop event set during discovery enqueue; aborting enqueue loop.")
                    break
                try:
                    await self._operation_queue.put(operation)
                except asyncio.QueueFull:
                    # Use a short timeout loop so stop_event is checked frequently
                    logger.warning("Operation queue full, waiting...")
                    try:
                        await asyncio.wait_for(self._operation_queue.put(operation), timeout=0.5)
                    except asyncio.TimeoutError:
                        if self._stop_event.is_set():
                            logger.info("Stop event set while waiting for queue space; aborting enqueue.")
                            break
                        # Retry on next iteration
                        continue
            
            files_found = len(found_files)
            self.discovery_progress.files_skipped += skipped_files
            
            logger.info(
                f"Discovered {files_found} files in {watch_path_model.path}, "
                f"skipped {skipped_files} due to errors"
            )
            
        except Exception as e:
            logger.error(f"Error scanning directory {watch_path_model.path}: {e}")
        
        return files_found
    
    async def _index_files(self) -> None:
        """Index files from the operation queue in parallel with discovery"""
        logger.info("Starting file indexing...")
        
        self.indexing_progress = IndexingProgress(
            files_to_index=0,
            files_indexed=0,
            files_failed=0,
            start_time=time.time()
        )
        
        while True:
            # Cooperative cancellation: exit promptly when stop is requested
            if self._stop_event.is_set():
                logger.info("Indexing loop detected stop event before dequeue; exiting.")
                break

            try:
                # Get operation from queue with timeout so we can re-check stop_event regularly
                try:
                    operation = await asyncio.wait_for(
                        self._operation_queue.get(),
                        timeout=0.5,
                    )
                except asyncio.TimeoutError:
                    # Periodically check stop while idle
                    continue
                except asyncio.CancelledError:
                    logger.info("Indexing task cancelled while waiting for operation")
                    break

                # If stop was requested after we dequeued, do not start new heavy work.
                if self._stop_event.is_set():
                    logger.info(
                        f"Stop requested; abandoning operation for {getattr(operation, 'file_path', None)}"
                    )
                    # Do not requeue to avoid fighting shutdown.
                    break

                self.indexing_progress.files_to_index += 1
                self.indexing_progress.current_file = getattr(operation, "file_path", None)

                # Process the operation
                try:
                    success = await self._process_operation(operation)
                except asyncio.CancelledError:
                    logger.info(
                        f"Indexing for {getattr(operation, 'file_path', None)} cancelled due to stop request"
                    )
                    break

                if self._stop_event.is_set():
                    # If a stop was triggered during processing, exit without starting further work.
                    logger.info("Stop event set after processing operation; exiting indexing loop.")
                    break

                if success:
                    self.indexing_progress.files_indexed += 1
                else:
                    self.indexing_progress.files_failed += 1

                # Update progress in database periodically
                if self.indexing_progress.files_indexed % 10 == 0:
                    db = SessionLocal()
                    try:
                        db_service = DatabaseService(db)
                        progress = int(
                            self.indexing_progress.files_indexed
                            / max(1, self.indexing_progress.files_to_index)
                            * 100
                        )
                        db_service.update_crawler_state(
                            indexing_progress=progress,
                            files_indexed=self.indexing_progress.files_indexed,
                            files_error=self.indexing_progress.files_failed,
                        )
                    finally:
                        db.close()

            except Exception as e:
                logger.error(f"Error in indexing loop: {e}")
                await asyncio.sleep(1)

        logger.info(
            f"Indexing finished: {self.indexing_progress.files_indexed} indexed, "
            f"{self.indexing_progress.files_failed} failed"
        )
    
    async def _process_operation(self, operation: CrawlOperation) -> bool:
        """Process a single operation (create/edit/delete)"""
        try:
            if operation.operation == OperationType.DELETE:
                return await self._handle_delete_operation(operation)
            else:  # CREATE or EDIT
                return await self._handle_create_edit_operation(operation)
                
        except Exception as e:
            logger.error(f"Error processing operation for {operation.file_path}: {e}")
            return False
    
    async def _handle_create_edit_operation(self, operation: CrawlOperation) -> bool:
        """Handle create or edit operations with proper error handling.

        All heavy work (hashing, extraction, Typesense I/O) is offloaded to the
        thread pool via _run_in_executor to keep the event loop responsive.
        """
        file_path = operation.file_path

        # Check if stop was requested before starting any work
        if self._stop_event.is_set():
            logger.info(f"Stop requested before processing {file_path}; skipping.")
            return False

        # Check if file still exists
        if not os.path.exists(file_path):
            logger.warning(f"File no longer exists: {file_path}")
            return False

        # Check file size
        max_size_mb = int(os.getenv("MAX_FILE_SIZE_MB", "100"))
        max_size_bytes = max_size_mb * 1024 * 1024

        if operation.file_size and operation.file_size > max_size_bytes:
            logger.warning(f"File too large ({operation.file_size} bytes): {file_path}")
            return False

        # Extract file information
        file_name = Path(file_path).name
        file_extension = Path(file_path).suffix.lower()
        mime_type, _ = mimetypes.guess_type(file_path)
        if not mime_type:
            mime_type = "application/octet-stream"

        try:
            logger.debug(f"Processing {operation.operation} for: {file_path}")

            # Calculate file hash from actual file bytes for change detection (blocking I/O)
            file_hash = await self._calculate_file_hash(file_path)
            if not file_hash:
                logger.error(f"Failed to calculate file hash for {file_path}")
                return False

            if self._stop_event.is_set():
                logger.info(f"Stop requested after hash for {file_path}; aborting.")
                return False

            # Check existing Typesense document (blocking HTTP)
            async def _get_doc():
                return await self.typesense.get_doc_by_path(file_path)

            existing_doc = await _get_doc()
            if existing_doc and existing_doc.get("file_hash") == file_hash:
                # Already indexed and up-to-date; idempotent no-op
                logger.debug(f"Skipping unchanged file (already indexed): {file_path}")
                return True

            if self._stop_event.is_set():
                logger.info(f"Stop requested before extraction for {file_path}; aborting.")
                return False

            # Extract file content (potentially heavy: Docling/OCR)
            def _extract():
                return self.extractor.extract(file_path)

            document_content = await self._run_in_executor(_extract)
            content = document_content.content
            metadata = document_content.metadata

            if self._stop_event.is_set():
                logger.info(f"Stop requested before Typesense index for {file_path}; aborting.")
                return False

            # Index/Upsert file in Typesense (blocking HTTP)
            async def _index():
                await self.typesense.index_file(
                    file_path=file_path,
                    file_name=file_name,
                    file_extension=file_extension,
                    file_size=operation.file_size,
                    mime_type=mime_type,
                    content=content,
                    modified_time=int(operation.modified_time) if operation.modified_time is not None else None,
                    created_time=int(operation.created_time) if operation.created_time is not None else None,
                    file_hash=file_hash,
                    metadata=metadata,
                )

            await _index()

            logger.debug(f"Successfully indexed (or updated): {file_path}")
            return True

        except Exception as e:
            logger.error(f"Error processing file {file_path}: {e}")
            return False
    
    async def _handle_delete_operation(self, operation: CrawlOperation) -> bool:
        """Handle delete operations.

        Offloads Typesense call to keep event loop free.
        """
        if self._stop_event.is_set():
            logger.info(f"Stop requested before delete for {operation.file_path}; skipping.")
            return False

        try:
            async def _remove():
                await self.typesense.remove_from_index(operation.file_path)

            await _remove()
            return True

        except Exception as e:
            logger.error(f"Error handling delete for {operation.file_path}: {e}")
            return False
    
    async def _calculate_file_hash(self, file_path: str) -> str:
        """Calculate hash of actual file content for change detection.

        Runs in a worker thread to avoid blocking the event loop.
        """
        def _hash():
            try:
                hash_md5 = hashlib.md5()
                with open(file_path, "rb") as f:
                    # Read file in chunks to handle large files efficiently
                    for chunk in iter(lambda: f.read(4096), b""):
                        hash_md5.update(chunk)
                return hash_md5.hexdigest()
            except Exception as e:
                logger.error(f"Error calculating file hash for {file_path}: {e}")
                return ""

        return await self._run_in_executor(_hash)


# Global crawl job manager instance
_crawl_job_manager: CrawlJobManager | None = None


def get_crawl_job_manager() -> CrawlJobManager:
    """Get or create global crawl job manager"""
    global _crawl_job_manager
    if _crawl_job_manager is None:
        _crawl_job_manager = CrawlJobManager()
    return _crawl_job_manager