"""
Application path management using platformdirs
"""

from pathlib import Path
from typing import Dict

from platformdirs import (
    PlatformDirs,
    user_documents_dir,
    user_downloads_dir,
    user_music_dir,
    user_pictures_dir,
    user_videos_dir,
)

from file_brain.core.logging import logger

# Initialize platform dirs
_dirs = PlatformDirs(appname="file-brain", appauthor=False)


class AppPaths:
    """Centralized management of application paths"""

    def __init__(self):
        self._ensure_directories()

    @property
    def data_dir(self) -> Path:
        """Base data directory (e.g., ~/.local/share/file-brain)"""
        return Path(_dirs.user_data_dir)

    @property
    def database_file(self) -> Path:
        """Path to SQLite database file"""
        return self.data_dir / "file_brain.db"

    @property
    def typesense_data_dir(self) -> Path:
        """Directory for Typesense data (index)"""
        return self.data_dir / "typesense-data"

    @property
    def models_dir(self) -> Path:
        """Directory for downloaded ML models"""
        return self.typesense_data_dir / "models"

    @property
    def user_documents_dir(self) -> Path:
        """User's Documents directory"""
        return Path(user_documents_dir())

    @property
    def user_downloads_dir(self) -> Path:
        """User's Downloads directory"""
        return Path(user_downloads_dir())

    @property
    def user_music_dir(self) -> Path:
        """User's Music directory"""
        return Path(user_music_dir())

    @property
    def user_pictures_dir(self) -> Path:
        """User's Pictures directory"""
        return Path(user_pictures_dir())

    @property
    def user_videos_dir(self) -> Path:
        """User's Videos directory"""
        return Path(user_videos_dir())

    def _ensure_directories(self) -> None:
        """Ensure all required directories exist"""
        try:
            self.data_dir.mkdir(parents=True, exist_ok=True)
            self.models_dir.mkdir(parents=True, exist_ok=True)
            logger.info(f"App data directory: {self.data_dir}")
        except Exception as e:
            logger.error(f"Failed to create app directories: {e}")
            raise

    def get_env_vars(self) -> Dict[str, str]:
        """Get environment variables for Docker containers"""
        return {
            "TYPESENSE_DATA_DIR": str(self.typesense_data_dir),
            "TYPESENSE_MODELS_DIR": str(self.models_dir),
        }


# Global instance
app_paths = AppPaths()
