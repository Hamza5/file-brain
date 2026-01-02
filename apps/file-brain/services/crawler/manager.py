"""
Crawl Job Manager - coordinates discovery and indexing
"""

import asyncio
import time
from datetime import datetime
from typing import List, Dict, Any, Optional
from dataclasses import dataclass

from database.models import WatchPath, SessionLocal
from database.repositories import CrawlerStateRepository
from services.crawler.discoverer import FileDiscoverer
from services.crawler.indexer import FileIndexer
from services.crawler.verification import IndexVerifier, VerificationProgress
from services.typesense_client import get_typesense_client
from core.logging import logger


@dataclass
class DiscoveryProgress:
    """Progress tracking for file discovery"""

    total_paths: int = 0
    processed_paths: int = 0
    files_found: int = 0
    files_skipped: int = 0
    current_path: Optional[str] = None
    start_time: Optional[float] = None


@dataclass
class IndexingProgress:
    """Progress tracking for file indexing"""

    files_to_index: int = 0
    files_indexed: int = 0
    files_failed: int = 0
    current_file: Optional[str] = None
    start_time: Optional[float] = None


class CrawlJobManager:
    """
    Coordinates the file discovery and indexing process.
    """

    def __init__(self, watch_paths: List[WatchPath] = None):
        self.watch_paths = watch_paths or []
        self.discoverer = FileDiscoverer(self.watch_paths)
        self.indexer = FileIndexer()
        self.verifier = IndexVerifier()
        self._stop_event = asyncio.Event()
        self._running = False

        # Progress tracking
        self.discovery_progress = DiscoveryProgress()
        self.indexing_progress = IndexingProgress()
        self.verification_progress = VerificationProgress()
        self._start_time: Optional[datetime] = None

    def is_running(self) -> bool:
        return self._running

    def get_status(self) -> Dict[str, Any]:
        """
        Get current crawl status and progress.
        """
        if self._running:
            return self._get_live_status()

        # If not running, try to get last known state from DB
        db = SessionLocal()
        try:
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
                "monitoring_active": False,
                "estimated_completion": None,
            }
        finally:
            db.close()

    def _get_live_status(self) -> Dict[str, Any]:
        """Calculate status from internal counters"""
        elapsed_time = (
            (datetime.utcnow() - self._start_time).total_seconds()
            if self._start_time
            else 0
        )

        # Discovery progress
        discovery_pct = 0
        if self.discovery_progress.total_paths > 0:
            discovery_pct = int(
                (
                    self.discovery_progress.processed_paths
                    / self.discovery_progress.total_paths
                )
                * 100
            )
            discovery_pct = min(discovery_pct, 100)

        # Verification progress
        verification_pct = 0
        if self.verification_progress.total_indexed > 0:
            verification_pct = int(
                (
                    self.verification_progress.processed_count
                    / self.verification_progress.total_indexed
                )
                * 100
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

        if (
            indexing_pct >= 100
            and discovery_pct >= 100
            and self.verification_progress.is_complete
        ):
            current_phase = "idle"

        return {
            "running": self._running,
            "job_type": "crawl",
            "current_phase": current_phase,
            "start_time": int(self._start_time.timestamp() * 1000)
            if self._start_time
            else None,
            "elapsed_time": int(elapsed_time),
            "discovery_progress": discovery_pct,
            "indexing_progress": indexing_pct,
            "verification_progress": verification_pct,
            "files_discovered": total_known,
            "files_indexed": files_indexed,
            "files_skipped": self.discovery_progress.files_skipped,
            "queue_size": max(0, total_known - files_indexed),
            "monitoring_active": False,
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
        self.discovery_progress = DiscoveryProgress(
            total_paths=len(self.watch_paths), start_time=time.time()
        )
        self.indexing_progress = IndexingProgress(start_time=time.time())

        # Reset verifier
        self.verifier = IndexVerifier()  # Re-instantiate to reset progress
        self.verification_progress = self.verifier.progress

        # Update DB state - explicitly reset counts
        db = SessionLocal()
        try:
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
        finally:
            db.close()

        # Run in background
        asyncio.create_task(self._run_crawl())
        return True

    async def _run_crawl(self):
        """Run discovery and indexing in parallel using a queue"""

        # Phase 1: Verify Index
        # We run this BEFORE discovery to ensure the index is clean
        try:
            logger.info("Starting index verification phase...")
            await self.verifier.verify_index()
            logger.info("Index verification phase completed.")
        except Exception as e:
            logger.error(f"Index verification failed: {e}")
            # We continue to discovery even if verification fails,
            # but mark verification as complete so we don't get stuck in 'verifying' phase
            self.verification_progress.is_complete = True

        if self._stop_event.is_set():
            self._running = False
            return

        # Phase 2: Parallel Discovery & Indexing
        # Internal queue to buffer discovered files for indexing
        # Larger queue to allow discovery to run ahead
        queue = asyncio.Queue(maxsize=2000)

        async def discovery_worker():
            """Discovery task: scans filesystem and fills the queue"""
            try:
                async for operation in self.discoverer.discover():
                    if self._stop_event.is_set():
                        break
                    self.discovery_progress.files_found += 1
                    await queue.put(operation)

                # Signal indexing that discovery is finished
                await queue.put(None)
                self.discovery_progress.processed_paths = (
                    self.discovery_progress.total_paths
                )
            except Exception as e:
                logger.error(f"Discovery worker failed: {e}")
                await queue.put(None)

        async def indexing_worker():
            """Indexing task: consumes from queue and indexes files"""
            try:
                while True:
                    operation = await queue.get()
                    if operation is None:  # End signal
                        break

                    self.indexing_progress.files_to_index += 1
                    success = await self.indexer.index_file(operation)
                    if success:
                        self.indexing_progress.files_indexed += 1
                    else:
                        self.indexing_progress.files_failed += 1

                    queue.task_done()

                    # Periodically update DB (every 20 files for efficiency)
                    if self.indexing_progress.files_indexed % 20 == 0:
                        self._update_db_progress()
            except Exception as e:
                logger.error(f"Indexing worker failed: {e}")

        try:
            # Run both workers concurrently
            await asyncio.gather(discovery_worker(), indexing_worker())
            self._update_db_progress()

        except Exception as e:
            logger.error(f"Crawl job failed: {e}")
        finally:
            # Important: Get final status while counters are still accurate
            final_status = self._get_live_status()
            self._running = False

            db = SessionLocal()
            try:
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
            finally:
                db.close()

    def _update_db_progress(self):
        db = SessionLocal()
        try:
            repo = CrawlerStateRepository(db)
            status = self.get_status()
            repo.update_state(
                discovery_progress=status["discovery_progress"],
                indexing_progress=status["indexing_progress"],
                files_discovered=status["files_discovered"],
                files_indexed=status["files_indexed"],
            )
        finally:
            db.close()

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

            db = SessionLocal()
            try:
                # 2. Reset crawler statistics and state
                state_repo = CrawlerStateRepository(db)
                state_repo.reset_stats()

                logger.info("✅ Indexes cleared and statistics reset")
            finally:
                db.close()
            return True
        except Exception as e:
            logger.error(f"Error clearing indexes: {e}")
            return False

    async def verify_indexed_files(self, watch_paths: List[str]) -> Dict[str, int]:
        """
        Placeholder for index verification.
        """
        return {
            "total_indexed": 0,
            "verified_accessible": 0,
            "orphaned_found": 0,
            "verification_errors": 0,
        }


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
