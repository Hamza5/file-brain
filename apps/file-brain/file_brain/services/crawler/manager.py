"""
Crawl Job Manager - coordinates discovery and indexing
"""

import threading
import time
from datetime import datetime
from typing import Any, Dict, List, Optional

from file_brain.api.models.operations import CrawlOperation
from file_brain.core.logging import logger
from file_brain.core.telemetry import telemetry
from file_brain.database.models import WatchPath, db_session
from file_brain.database.repositories import CrawlerStateRepository
from file_brain.services.crawler.discoverer import FileDiscoverer
from file_brain.services.crawler.indexer import FileIndexer
from file_brain.services.crawler.monitor import FileMonitorService
from file_brain.services.crawler.progress import CrawlProgressTracker
from file_brain.services.crawler.queue import DedupQueue
from file_brain.services.crawler.verification import IndexVerifier
from file_brain.services.typesense_client import get_typesense_client


class CrawlJobManager:
    """
    Coordinates the file discovery and indexing process.
    """

    def __init__(self, watch_paths: List[WatchPath] = None):
        self.watch_paths = watch_paths or []
        self.discoverer = FileDiscoverer(self.watch_paths)
        self.indexer = FileIndexer()
        self.verifier = IndexVerifier()
        self.queue = DedupQueue[CrawlOperation]()  # Shared queue
        self.monitor = FileMonitorService(self.queue)  # Pass queue to monitor
        self._stop_event = threading.Event()
        self._running = False

        # Background indexing thread
        self._indexing_thread: threading.Thread | None = None

        # Progress tracking
        self.tracker = CrawlProgressTracker()
        self.discovery_progress = self.tracker.discovery
        self.indexing_progress = self.tracker.indexing
        self.verification_progress = self.tracker.verification
        self._start_time: Optional[datetime] = None

        # Restore monitoring state on init
        self._restore_monitoring_state()

    def _restore_monitoring_state(self):
        """Check DB and restart monitor if it was active"""
        with db_session() as db:
            try:
                repo = CrawlerStateRepository(db)
                state = repo.get_state()
                if state.monitoring_active:
                    # We need configured paths to start monitoring
                    # If watch_paths are not yet loaded (empty init), we might need to fetch them
                    if not self.watch_paths:
                        from file_brain.database.repositories import WatchPathRepository

                        wp_repo = WatchPathRepository(db)
                        self.watch_paths = wp_repo.get_enabled()
                        self.discoverer.watch_paths = self.watch_paths  # Sync discoverer too

                    if self.watch_paths:
                        logger.info("Restoring file monitor state: Active")
                        self.monitor.start(self.watch_paths)
            except Exception as e:
                logger.error(f"Failed to restore monitoring state: {e}")

    def is_running(self) -> bool:
        return self._running

    def get_status(self) -> Dict[str, Any]:
        """
        Get current crawl status and progress.
        """
        if self._running:
            return self._get_live_status()

        # If not running, try to get last known state from DB
        with db_session() as db:
            repo = CrawlerStateRepository(db)
            state = repo.get_state()

            # Ensure consistency even in idle state
            files_indexed = state.files_indexed or 0
            files_discovered = max(state.files_discovered or 0, files_indexed)

            indexing_progress = 0
            if files_discovered > 0:
                indexing_progress = int((files_indexed / files_discovered) * 100)

            return {
                "running": False,
                "job_type": None,
                "current_phase": "idle",
                "start_time": None,
                "elapsed_time": None,
                "discovery_progress": min(state.discovery_progress or 0, 100),
                "indexing_progress": min(indexing_progress, 100),
                "verification_progress": 0,
                "files_discovered": files_discovered,
                "files_indexed": files_indexed,
                "files_skipped": 0,
                "queue_size": 0,
                "monitoring_active": state.monitoring_active or False,
                "estimated_completion": None,
            }

    def _get_live_status(self) -> Dict[str, Any]:
        """Calculate status from internal counters"""
        elapsed_time = (datetime.utcnow() - self._start_time).total_seconds() if self._start_time else 0

        # Discovery progress
        discovery_pct = 0
        if self.discovery_progress.total_paths > 0:
            discovery_pct = int((self.discovery_progress.processed_paths / self.discovery_progress.total_paths) * 100)
            discovery_pct = min(discovery_pct, 100)

        # Verification progress
        verification_pct = 0
        if self.verification_progress.total_indexed > 0:
            verification_pct = int(
                (self.verification_progress.processed_count / self.verification_progress.total_indexed) * 100
            )
            verification_pct = min(verification_pct, 100)
        elif self.verification_progress.is_complete:
            verification_pct = 100

        # Indexing progress
        files_indexed = self.indexing_progress.files_indexed
        # Use discoverer.files_found as the source of truth for discovered files
        # Do NOT include files_to_index as it includes monitor events
        total_known = max(
            self.discoverer.files_found,
            self.discovery_progress.files_found,
            files_indexed,  # Ensure we never show less discovered than indexed
        )

        indexing_pct = self.tracker.get_indexing_percent(total_known)

        current_phase = "discovering" if discovery_pct < 100 else "indexing"
        if not self.verification_progress.is_complete:
            current_phase = "verifying"

        if indexing_pct >= 100 and discovery_pct >= 100 and self.verification_progress.is_complete:
            current_phase = "idle"

        return {
            "running": self._running,
            "job_type": "crawl",
            "current_phase": current_phase,
            "start_time": int(self._start_time.timestamp() * 1000) if self._start_time else None,
            "elapsed_time": int(elapsed_time),
            "discovery_progress": discovery_pct,
            "indexing_progress": indexing_pct,
            "verification_progress": verification_pct,
            "files_discovered": total_known,
            "files_indexed": files_indexed,
            "files_skipped": self.discovery_progress.files_skipped,
            "queue_size": max(0, total_known - files_indexed),
            "monitoring_active": self.monitor.is_running(),
            "estimated_completion": None,
            "orphan_count": self.verification_progress.orphaned_count,
        }

    def _ensure_indexing_thread(self):
        """Ensure indexing thread is running."""
        if self._indexing_thread is None or not self._indexing_thread.is_alive():
            logger.info("Starting indexing worker thread")
            self._indexing_thread = threading.Thread(target=self._process_queue, daemon=True, name="indexing_worker")
            self._indexing_thread.start()

    def start_crawl(self) -> bool:
        if self._running:
            logger.warning("Crawl job already running.")
            return False

        # Ensure indexing thread is running
        self._ensure_indexing_thread()

        self._running = True
        self._stop_event.clear()
        self._start_time = datetime.utcnow()

        # Reset component stop events
        self.discoverer.reset()
        self.indexer.reset()
        self.verifier.reset()

        # Reset progress
        self.tracker.reset(len(self.watch_paths))
        # Re-bind aliases after reset creates new objects
        self.discovery_progress = self.tracker.discovery
        self.indexing_progress = self.tracker.indexing
        self.verification_progress = self.tracker.verification

        # Re-bind verifier progress after reset
        self.verification_progress = self.verifier.progress

        # Update DB state - explicitly reset counts
        with db_session() as db:
            repo = CrawlerStateRepository(db)
            repo.update_state(
                crawl_job_running=True,
                crawl_job_type="crawl",
                crawl_job_started_at=self._start_time,
                discovery_progress=0,
                indexing_progress=0,
                files_discovered=0,
                files_indexed=0,
            )

        # Run in background thread
        crawl_thread = threading.Thread(target=self._run_crawl, daemon=True, name="crawl_worker")
        crawl_thread.start()
        return True

    def _process_queue(self):
        """
        Persistent worker that processes operations from the shared queue.
        """
        logger.info("Indexing worker started")
        while True:
            try:
                operation = self.queue.get()

                # Check for stop signal (None) if we ever use one,
                # but currently we run forever until app stop.
                # If we want to support graceful shutdown we can check for None.

                self.indexing_progress.files_to_index += 1

                def progress_cb(chunk_idx, chunk_total):
                    self.indexing_progress.current_chunk_index = chunk_idx
                    self.indexing_progress.current_chunk_total = chunk_total

                # Process the operation
                success = self.indexer.index_file(operation, progress_callback=progress_cb)

                if success:
                    self.indexing_progress.files_indexed += 1
                    # Track file indexed (batched)
                    telemetry.track_batched_event("file_indexed")
                else:
                    self.indexing_progress.files_failed += 1

                self.queue.task_done()

                # Periodically update DB
                if self.indexing_progress.files_indexed % 20 == 0:
                    self._update_db_progress()

            except Exception as e:
                logger.error(f"Error in indexing worker: {e}")
                time.sleep(1)  # Prevent tight loop on error

    def _run_crawl(self):
        """Run discovery and fill the shared queue"""

        # Phase 1: Verify Index
        try:
            logger.info("Starting index verification phase...")
            self.verifier.verify_index()
            logger.info("Index verification phase completed.")
        except Exception as e:
            logger.error(f"Index verification failed: {e}")
            self.verification_progress.is_complete = True

        if self._stop_event.is_set():
            self._running = False
            return

        # Phase 2: Discovery
        # We push directly to the shared queue

        try:
            for operation in self.discoverer.discover():
                if self._stop_event.is_set():
                    break
                self.discovery_progress.files_found += 1
                # Track file discovered (batched)
                telemetry.track_batched_event("file_discovered")
                # Use file path as key for deduplication
                self.queue.put(operation.file_path, operation)

            self.discovery_progress.processed_paths = self.discovery_progress.total_paths

            # Wait for indexing to catch up with discovery
            # We consider the crawl "active" until we are idle or stopped
            while self._running and not self._stop_event.is_set():
                # Check if we are done:
                # 1. Discovery is done (we are past the loop)
                # 2. Queue is empty
                # 3. All discovered files have been attempted (indexed or failed)

                total_processed = self.indexing_progress.files_indexed + self.indexing_progress.files_failed

                # Note: files_found might be > processed if queue is not empty
                if self.queue.qsize() == 0 and total_processed >= self.discovery_progress.files_found:
                    logger.info("Indexing job completed (queue empty and all files processed)")
                    break

                time.sleep(1)

        except Exception as e:
            logger.error(f"Crawl job failed: {e}")
        finally:
            # Important: Get final status while counters are still accurate
            final_status = self._get_live_status()
            elapsed_time = (datetime.utcnow() - self._start_time).total_seconds() if self._start_time else 0
            self._running = False

            # Capture crawl completion event with metrics
            telemetry.capture_event(
                "crawl_completed",
                {
                    "files_discovered": final_status["files_discovered"],
                    "files_indexed": final_status["files_indexed"],
                    "files_skipped": final_status["files_skipped"],
                    "orphan_count": final_status.get("orphan_count", 0),
                    "duration_seconds": round(elapsed_time, 2),
                    "watch_path_count": len(self.watch_paths),
                },
            )

            with db_session() as db:
                repo = CrawlerStateRepository(db)
                repo.update_state(
                    crawl_job_running=False,
                    crawl_job_type=None,
                    crawl_job_started_at=None,
                    discovery_progress=final_status["discovery_progress"],
                    indexing_progress=final_status["indexing_progress"],
                    files_discovered=final_status["files_discovered"],
                    files_indexed=final_status["files_indexed"],
                )

    def _update_db_progress(self):
        with db_session() as db:
            repo = CrawlerStateRepository(db)
            status = self.get_status()
            repo.update_state(
                discovery_progress=int(status["discovery_progress"]),
                indexing_progress=int(status["indexing_progress"]),
                files_discovered=status["files_discovered"],
                files_indexed=status["files_indexed"],
            )

    def stop_crawl(self):
        if not self._running:
            return
        logger.debug("Stopping indexing job...")
        self._stop_event.set()
        self.verifier.stop()
        self.discoverer.stop()
        self.indexer.stop()

        # Note: We don't cancel the indexing task here as it's persistent
        # and continues to process any remaining queue items

    def clear_indexes(self) -> bool:
        """Reset the collection (drop and recreate with latest schema) and reset statistics"""
        logger.info("Resetting collection and statistics...")
        try:
            # 1. Reset search collection (drop and recreate with latest schema)
            typesense = get_typesense_client()
            logger.info("Dropping and recreating Typesense collection with latest schema...")
            typesense.reset_collection()

            with db_session() as db:
                # 2. Reset crawler statistics and state
                state_repo = CrawlerStateRepository(db)
                state_repo.reset_stats()

                logger.info("✅ Collection reset and statistics cleared")
            return True
        except Exception as e:
            logger.error(f"Error resetting collection: {e}")
            return False

    def start_monitoring(self) -> bool:
        """Start file monitoring"""
        logger.info("Starting file monitoring...")

        # Ensure indexing thread is running to process monitored file events
        self._ensure_indexing_thread()

        # Get enabled paths
        if not self.watch_paths:
            with db_session() as db:
                from file_brain.database.repositories import WatchPathRepository

                wp_repo = WatchPathRepository(db)
                self.watch_paths = wp_repo.get_enabled()
                # Update discoverer too
                self.discoverer.watch_paths = self.watch_paths

        if not self.watch_paths:
            logger.warning("No watch paths to monitor")
            return False

        try:
            self.monitor.start(self.watch_paths)

            # Capture monitoring started event
            telemetry.capture_event("file_monitoring_started")

            # Persist state
            with db_session() as db:
                repo = CrawlerStateRepository(db)
                repo.update_state(monitoring_active=True)

            return True
        except Exception as e:
            logger.error(f"Failed to start monitoring: {e}")
            return False

    def stop_monitoring(self):
        """Stop file monitoring"""
        logger.info("Stopping file monitoring...")
        try:
            self.monitor.stop()

            # Capture monitoring stopped event
            telemetry.capture_event("file_monitoring_stopped")

            # Persist state
            with db_session() as db:
                repo = CrawlerStateRepository(db)
                repo.update_state(monitoring_active=False)
        except Exception as e:
            logger.error(f"Failed to stop monitoring: {e}")


# Global crawl job manager instance
_crawl_job_manager: CrawlJobManager | None = None


def get_crawl_job_manager(watch_paths: List[WatchPath] = None) -> CrawlJobManager:
    """Get or create global crawl job manager"""
    global _crawl_job_manager
    if _crawl_job_manager is None:
        _crawl_job_manager = CrawlJobManager(watch_paths)
    elif watch_paths:
        _crawl_job_manager.watch_paths = watch_paths
        _crawl_job_manager.discoverer.watch_paths = watch_paths
    return _crawl_job_manager
