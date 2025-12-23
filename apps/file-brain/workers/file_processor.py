"""
Background file processor (Database-backed)
"""
import os
import mimetypes
import asyncio
from pathlib import Path
from typing import Union

from api.models.file_event import FileDiscoveredEvent, FileChangedEvent, FileDeletedEvent
from services.extractor import get_extractor
from services.typesense_client import get_typesense_client
from database.models import SessionLocal
from services.database_service import DatabaseService
from utils.logger import logger


class FileProcessor:
    """Background file processor"""
    
    def __init__(self):
        # Get queue size from environment
        max_queue_size = int(os.getenv("WORKER_QUEUE_SIZE", "1000"))
        self.queue: asyncio.Queue = asyncio.Queue(maxsize=max_queue_size)
        self.extractor = get_extractor()
        self.typesense = get_typesense_client()
        self._running = False
        self._task: asyncio.Task | None = None
    
    def enqueue_event(
        self,
        event: Union[FileDiscoveredEvent, FileChangedEvent, FileDeletedEvent]
    ) -> None:
        """
        Enqueue file event for processing (called from sync context)
        """
        try:
            # Use put_nowait since we're in sync context
            self.queue.put_nowait(event)
        except asyncio.QueueFull:
            logger.error("Processing queue is full, event dropped")
            # Increment error in database
            db = SessionLocal()
            try:
                db_service = DatabaseService(db)
                db_service.increment_stat("files_error")
            finally:
                db.close()
    
    async def start(self) -> None:
        """Start background processor"""
        if self._running:
            logger.warning("Processor already running")
            return
        
        self._running = True
        
        # Update state in database
        db = SessionLocal()
        try:
            db_service = DatabaseService(db)
            db_service.update_crawler_state(processor_running=True)
        finally:
            db.close()
        
        self._task = asyncio.create_task(self._process_loop())
        logger.info("File processor started")
    
    async def stop(self) -> None:
        """Stop background processor"""
        if not self._running:
            logger.warning("Processor not running")
            return
        
        self._running = False
        
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        
        # Update state in database
        db = SessionLocal()
        try:
            db_service = DatabaseService(db)
            db_service.update_crawler_state(processor_running=False)
        finally:
            db.close()
        
        logger.info("File processor stopped")
    
    async def _process_loop(self) -> None:
        """Main processing loop"""
        logger.info("Processing loop started")
        
        while self._running:
            try:
                # Wait for event with timeout
                try:
                    event = await asyncio.wait_for(self.queue.get(), timeout=1.0)
                except asyncio.TimeoutError:
                    continue
                
                # Check if paused
                db = SessionLocal()
                try:
                    db_service = DatabaseService(db)
                    state = db_service.get_crawler_state()
                    
                    if state.paused:
                        logger.debug("Processor paused, re-queuing event")
                        await asyncio.sleep(1)
                        await self.queue.put(event)
                        continue
                finally:
                    db.close()
                
                # Process event
                await self._process_event(event)
                
            except Exception as e:
                logger.error(f"Error in processing loop: {e}")
                await asyncio.sleep(1)
        
        logger.info("Processing loop stopped")
    
    async def _process_event(
        self,
        event: Union[FileDiscoveredEvent, FileChangedEvent, FileDeletedEvent]
    ) -> None:
        """Process a single file event"""
        try:
            if isinstance(event, FileDeletedEvent):
                await self._handle_deleted(event)
            elif isinstance(event, (FileDiscoveredEvent, FileChangedEvent)):
                await self._handle_discovered_or_changed(event)
            else:
                logger.warning(f"Unknown event type: {type(event)}")
        except Exception as e:
            logger.error(f"Error processing event for {event.file_path}: {e}")
            
            # Increment error counter
            db = SessionLocal()
            try:
                db_service = DatabaseService(db)
                db_service.increment_stat("files_error")
            finally:
                db.close()
    
    async def _handle_deleted(self, event: FileDeletedEvent) -> None:
        """Handle file deletion"""
        logger.info(f"Processing deleted file: {event.file_path}")
        
        try:
            await self.typesense.remove_from_index(event.file_path)
            
            # Increment deleted counter
            db = SessionLocal()
            try:
                db_service = DatabaseService(db)
                db_service.increment_stat("files_deleted")
            finally:
                db.close()
                
        except Exception as e:
            logger.error(f"Error removing file from index: {e}")
            
            # Increment error counter
            db = SessionLocal()
            try:
                db_service = DatabaseService(db)
                db_service.increment_stat("files_error")
            finally:
                db.close()
    
    async def _handle_discovered_or_changed(
        self,
        event: Union[FileDiscoveredEvent, FileChangedEvent]
    ) -> None:
        """Handle file discovery or modification"""
        file_path = event.file_path
        
        # Count discovery
        if isinstance(event, FileDiscoveredEvent):
            db = SessionLocal()
            try:
                db_service = DatabaseService(db)
                db_service.increment_stat("files_discovered")
            finally:
                db.close()
            logger.info(f"Processing discovered file: {file_path}")
        else:
            logger.info(f"Processing modified file: {file_path}")
        
        # Check if file still exists
        if not os.path.exists(file_path):
            logger.warning(f"File no longer exists: {file_path}")
            await self.typesense.remove_from_index(file_path)
            return
        
        # Check file size
        max_size_mb = int(os.getenv("MAX_FILE_SIZE_MB", "100"))
        max_size_bytes = max_size_mb * 1024 * 1024
        file_size = event.file_size
        
        if file_size > max_size_bytes:
            logger.warning(
                f"File too large ({file_size} bytes), skipping: {file_path}"
            )
            return
        
        # Extract file info
        path_obj = Path(file_path)
        file_name = path_obj.name
        file_extension = path_obj.suffix.lower()
        mime_type, _ = mimetypes.guess_type(file_path)
        
        if mime_type is None:
            mime_type = "application/octet-stream"
        
        try:
            # Extract content
            content_result = self.extractor.extract(file_path)
            
            # Index in Typesense
            await self.typesense.index_file(
                file_path=file_path,
                file_name=file_name,
                file_extension=file_extension,
                file_size=file_size,
                mime_type=mime_type,
                content=content_result.content,
                modified_time=event.modified_time,
                created_time=getattr(event, "created_time", event.modified_time),
                metadata=content_result.metadata,
            )
            
            # Increment indexed counter
            db = SessionLocal()
            try:
                db_service = DatabaseService(db)
                db_service.increment_stat("files_indexed")
            finally:
                db.close()
            
            logger.info(f"Successfully indexed: {file_name}")
            
        except Exception as e:
            logger.error(f"Error processing {file_path}: {e}")
            
            # Increment error counter
            db = SessionLocal()
            try:
                db_service = DatabaseService(db)
                db_service.increment_stat("files_error")
            finally:
                db.close()


# Global processor instance
_processor: FileProcessor | None = None


def get_file_processor() -> FileProcessor:
    """Get or create global file processor"""
    global _processor
    if _processor is None:
        _processor = FileProcessor()
    return _processor