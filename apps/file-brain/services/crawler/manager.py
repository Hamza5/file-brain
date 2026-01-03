"""
Crawl Job Manager - coordinates discovery and indexing
"""

import asyncio
import time
from datetime import datetime
from typing import Any, Dict, List, Optional

from api.models.operations import CrawlOperation
from core.logging import logger
from database.models import WatchPath, db_session
from database.repositories import CrawlerStateRepository
from services.crawler.discoverer import FileDiscoverer
from services.crawler.indexer import FileIndexer
from services.crawler.monitor import FileMonitorService
from services.crawler.progress import DiscoveryProgress, IndexingProgress
from services.crawler.queue import DedupQueue
from services.crawler.verification import IndexVerifier, VerificationProgress
from services.typesense_client import get_typesense_client


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
        self._stop_event = asyncio.Event()
        self._running = False

        # Start persistent indexing worker
        self._indexing_task = asyncio.create_task(self._process_queue())

        # Progress tracking
        self.discovery_progress = DiscoveryProgress()
        self.indexing_progress = IndexingProgress()
        self.verification_progress = VerificationProgress()
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
                        from database.repositories import WatchPathRepository

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
        # Use discoverer.files_found for the most up-to-date count from the background thread
        total_known = max(
            self.discoverer.files_found,
            self.discovery_progress.files_found,
            self.indexing_progress.files_to_index,
            files_indexed,
        )

        indexing_pct = 0
        if total_known > 0:
            indexing_pct = int((files_indexed / total_known) * 100)
            indexing_pct = min(indexing_pct, 100)

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

    async def start_crawl(self) -> bool:
        if self._running:
            logger.warning("Crawl job already running.")
            return False

        self._running = True
        self._stop_event.clear()
        self._start_time = datetime.utcnow()

        # Reset progress
        self.discoverer.files_found = 0
        self.discovery_progress = DiscoveryProgress(total_paths=len(self.watch_paths), start_time=time.time())
        self.indexing_progress = IndexingProgress(start_time=time.time())

        # Reset verifier
        self.verifier = IndexVerifier()  # Re-instantiate to reset progress
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

        # Run in background
        asyncio.create_task(self._run_crawl())
        return True

    async def _process_queue(self):
        """
        Persistent worker that processes operations from the shared queue.
        """
        logger.info("Indexing worker started")
        while True:
            try:
                operation = await self.queue.get()

                # Check for stop signal (None) if we ever use one,
                # but currently we run forever until app stop.
                # If we want to support graceful shutdown we can check for None.

                self.indexing_progress.files_to_index += 1

                # Process the operation
                success = await self.indexer.index_file(operation)

                if success:
                    self.indexing_progress.files_indexed += 1
                else:
                    self.indexing_progress.files_failed += 1

                self.queue.task_done()

                # Periodically update DB
                if self.indexing_progress.files_indexed % 20 == 0:
                    self._update_db_progress()

            except asyncio.CancelledError:
                logger.info("Indexing worker cancelled")
                break
            except Exception as e:
                logger.error(f"Error in indexing worker: {e}")
                await asyncio.sleep(1)  # Prevent tight loop on error

    async def _run_crawl(self):
        """Run discovery and fill the shared queue"""

        # Phase 1: Verify Index
        try:
            logger.info("Starting index verification phase...")
            await self.verifier.verify_index()
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
            async for operation in self.discoverer.discover():
                if self._stop_event.is_set():
                    break
                self.discovery_progress.files_found += 1
                # Use file path as key for deduplication
                await self.queue.put(operation.file_path, operation)

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
                    logger.info("Crawl job completed (queue empty and all files processed)")
                    break

                await asyncio.sleep(1)

        except Exception as e:
            logger.error(f"Crawl job failed: {e}")
        finally:
            # Important: Get final status while counters are still accurate
            final_status = self._get_live_status()
            self._running = False

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
                discovery_progress=status["discovery_progress"],
                indexing_progress=status["indexing_progress"],
                files_discovered=status["files_discovered"],
                files_indexed=status["files_indexed"],
            )

    async def stop_crawl(self):
        if not self._running:
            return
        logger.info("Stopping crawl job...")
        self._stop_event.set()
        self.verifier.stop()
        self.discoverer.stop()
        self.indexer.stop()

    async def clear_indexes(self) -> bool:
        """Clear all files from Typesense and reset statistics (preserves watch paths)"""
        logger.info("Clearing search indexes and resetting statistics...")
        try:
            # 1. Clear search index
            typesense = get_typesense_client()
            await typesense.clear_all_documents()

            with db_session() as db:
                # 2. Reset crawler statistics and state
                state_repo = CrawlerStateRepository(db)
                state_repo.reset_stats()

                logger.info("✅ Indexes cleared and statistics reset")
            return True
        except Exception as e:
            logger.error(f"Error clearing indexes: {e}")
            return False

    async def start_monitoring(self) -> bool:
        """Start file monitoring"""
        logger.info("Starting file monitoring...")

        # Get enabled paths
        if not self.watch_paths:
            with db_session() as db:
                from database.repositories import WatchPathRepository

                wp_repo = WatchPathRepository(db)
                self.watch_paths = wp_repo.get_enabled()
                # Update discoverer too
                self.discoverer.watch_paths = self.watch_paths

        if not self.watch_paths:
            logger.warning("No watch paths to monitor")
            return False

        try:
            self.monitor.start(self.watch_paths)

            # Persist state
            with db_session() as db:
                repo = CrawlerStateRepository(db)
                repo.update_state(monitoring_active=True)

            return True
        except Exception as e:
            logger.error(f"Failed to start monitoring: {e}")
            return False

    async def stop_monitoring(self):
        """Stop file monitoring"""
        logger.info("Stopping file monitoring...")
        try:
            self.monitor.stop()

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
