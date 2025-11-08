"""
Initial file scanner - indexes existing files before starting watcher
"""
import os
import time
from pathlib import Path
from typing import List, Callable

from config.settings import settings
from api.models.file_event import FileDiscoveredEvent
# Removed import - using database-backed state instead
from utils.logger import logger


class InitialScanner:
    """Scans directories and indexes existing files"""
    
    def __init__(
        self,
        watch_paths: List[str],
        excluded_patterns: List[str],
        on_file_event: Callable,
    ):
        self.watch_paths = watch_paths
        self.excluded_patterns = excluded_patterns
        self.on_file_event = on_file_event
        # Using database-backed state through database_service
        pass
        
        self.files_found = 0
        self.files_skipped = 0
    
    def _should_process(self, path: str) -> bool:
        """Check if file should be processed"""
        # Check excluded patterns
        for pattern in self.excluded_patterns:
            if pattern in path:
                return False
        return True
    
    def _scan_directory(self, directory: str) -> None:
        """Recursively scan a directory"""
        try:
            for root, dirs, files in os.walk(directory):
                # Filter out excluded directories
                dirs[:] = [
                    d for d in dirs
                    if self._should_process(os.path.join(root, d))
                ]
                
                # Process files
                for filename in files:
                    file_path = os.path.join(root, filename)
                    
                    if not self._should_process(file_path):
                        self.files_skipped += 1
                        continue
                    
                    try:
                        # Get file stats
                        stats = os.stat(file_path)
                        
                        # Create file event
                        file_event = FileDiscoveredEvent(
                            file_path=file_path,
                            timestamp=int(time.time() * 1000),
                            file_size=stats.st_size,
                            modified_time=int(stats.st_mtime * 1000),
                            created_time=int(stats.st_ctime * 1000),
                        )
                        
                        # Enqueue for processing
                        self.on_file_event(file_event)
                        self.files_found += 1
                        
                        # Log progress periodically
                        if self.files_found % 100 == 0:
                            logger.info(
                                f"Initial scan progress: {self.files_found} files found, "
                                f"{self.files_skipped} skipped"
                            )
                        
                    except Exception as e:
                        logger.error(f"Error processing {file_path}: {e}")
                        self.files_skipped += 1
                        
        except Exception as e:
            logger.error(f"Error scanning directory {directory}: {e}")
    
    def scan(self) -> dict:
        """
        Perform initial scan of all watch paths
        
        Returns:
            Dictionary with scan statistics
        """
        logger.info("=" * 50)
        logger.info("Starting initial file scan...")
        logger.info("=" * 50)
        
        start_time = time.time()
        
        for watch_path in self.watch_paths:
            if not os.path.exists(watch_path):
                logger.warning(f"Watch path does not exist: {watch_path}")
                continue
            
            if not os.path.isdir(watch_path):
                logger.warning(f"Watch path is not a directory: {watch_path}")
                continue
            
            logger.info(f"Scanning: {watch_path}")
            self._scan_directory(watch_path)
        
        elapsed_time = time.time() - start_time
        
        logger.info("=" * 50)
        logger.info("Initial scan complete!")
        logger.info(f"  Files found: {self.files_found}")
        logger.info(f"  Files skipped: {self.files_skipped}")
        logger.info(f"  Time taken: {elapsed_time:.2f} seconds")
        logger.info("=" * 50)
        
        return {
            "files_found": self.files_found,
            "files_skipped": self.files_skipped,
            "elapsed_time": elapsed_time,
        }


def perform_initial_scan(
    on_file_event: Callable,
    watch_paths: List[str],
    excluded_patterns: List[str]
) -> dict:
    """
    Convenience function to perform initial scan
    
    Args:
        on_file_event: Callback function for file events
        watch_paths: List of paths to scan
        excluded_patterns: List of patterns to exclude
        
    Returns:
        Scan statistics
    """
    scanner = InitialScanner(
        watch_paths=watch_paths,
        excluded_patterns=excluded_patterns,
        on_file_event=on_file_event,
    )
    
    return scanner.scan()