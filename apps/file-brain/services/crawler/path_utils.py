"""
Path filtering utilities for the crawler subsystem.

Provides shared logic for checking if paths should be included or excluded
during file discovery, monitoring, and verification.
"""

import os
from typing import List


class PathFilter:
    """
    Shared path filtering logic for included/excluded paths.

    Eliminates duplicated exclusion checking code across discoverer, monitor,
    and verification modules.
    """

    def __init__(self, included_paths: List[str], excluded_paths: List[str]):
        """
        Initialize the path filter.

        Args:
            included_paths: List of paths to include (watch paths)
            excluded_paths: List of paths to exclude
        """
        self.included_paths = [os.path.normpath(p) for p in included_paths]
        self.excluded_paths = [os.path.normpath(p) for p in excluded_paths]

    def is_excluded(self, path: str) -> bool:
        """
        Check if a path should be excluded.

        Args:
            path: Path to check

        Returns:
            True if the path matches an excluded path or is inside one
        """
        norm_path = os.path.normpath(path)
        for excluded in self.excluded_paths:
            if norm_path == excluded or norm_path.startswith(excluded + os.sep):
                return True
        return False

    def is_inside_included(self, file_path: str) -> bool:
        """
        Check if a file path is within any of the included paths.

        Args:
            file_path: Path to check

        Returns:
            True if the path is inside an included path
        """
        norm_path = os.path.normpath(file_path)
        for included in self.included_paths:
            if norm_path.startswith(included) or norm_path.startswith(included + os.sep):
                return True
        return False

    def is_valid_path(self, file_path: str) -> bool:
        """
        Check if a file path is within included paths and not excluded.

        Args:
            file_path: Path to check

        Returns:
            True if the path is valid (inside included, not excluded)
        """
        if not self.is_inside_included(file_path):
            return False
        return not self.is_excluded(file_path)

    def should_prune_directory(self, dir_path: str) -> bool:
        """
        Check if a directory should be pruned during traversal.

        Used by os.walk to avoid descending into excluded directories.

        Args:
            dir_path: Directory path to check

        Returns:
            True if the directory should be skipped
        """
        return self.is_excluded(dir_path)
