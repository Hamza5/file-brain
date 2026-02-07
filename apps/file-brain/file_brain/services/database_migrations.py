import io
import logging
import sys
from pathlib import Path
from typing import List, Optional, Tuple

from alembic import command
from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory

import file_brain
from file_brain.database.models.base import engine

logger = logging.getLogger(__name__)


class DatabaseMigrationService:
    def __init__(self):
        # Locate alembic.ini relative to the package root
        # We assume the structure: apps/file-brain/file_brain/services/database_migrations.py
        # So package root is apps/file-brain/file_brain
        # And alembic.ini is in apps/file-brain/alembic.ini

        self.package_root = Path(file_brain.__file__).parent
        self.project_root = self.package_root.parent
        self.alembic_ini_path = self.project_root / "alembic.ini"

        if not self.alembic_ini_path.exists():
            logger.warning(f"alembic.ini not found at {self.alembic_ini_path}")

        self.alembic_cfg = Config(str(self.alembic_ini_path))
        # Prevent Alembic from configuring logging, we want to keep our app's logging setup
        self.alembic_cfg.attributes["configure_logger"] = False

    def get_current_revision(self) -> Optional[str]:
        """Get the current revision from the database."""
        try:
            with engine.connect() as connection:
                context = MigrationContext.configure(connection)
                return context.get_current_revision()
        except Exception as e:
            logger.error(f"Error getting current revision: {e}")
            return None

    def get_head_revision(self) -> str:
        """Get the head revision from the script directory."""
        try:
            script = ScriptDirectory.from_config(self.alembic_cfg)
            return script.get_current_head()
        except Exception as e:
            logger.error(f"Error getting head revision: {e}")
            # If we fail to get head (e.g. valid config but no scripts?),
            # we should probably re-raise or return something that indicates failure.
            # Returning empty string for now.
            return ""

    def check_migration_needed(self) -> Tuple[bool, Optional[str], str]:
        """
        Check if migration is needed.
        Returns: (needed, current_rev, head_rev)
        """
        current = self.get_current_revision()
        head = self.get_head_revision()

        # If head is empty, something is wrong with setup, assume no migration needed to prevent blocking
        if not head:
            return False, current, head

        # If current is same as head, no migration needed
        needed = current != head

        return needed, current, head

    def run_upgrade(self) -> Tuple[bool, List[str]]:
        """
        Run alembic upgrade head.
        Returns: (success, logs)
        """
        # Capture stdout/stderr to return logs to UI
        log_capture = io.StringIO()

        # Redirect stdout and stderr
        old_stdout = sys.stdout
        old_stderr = sys.stderr
        sys.stdout = log_capture
        sys.stderr = log_capture

        # Also add a stream handler to root logger to capture log output
        root_logger = logging.getLogger()
        stream_handler = logging.StreamHandler(log_capture)
        # Set level to INFO to capture migration steps
        stream_handler.setLevel(logging.INFO)
        root_logger.addHandler(stream_handler)

        success = False
        try:
            logger.info("Starting database upgrade to head...")
            command.upgrade(self.alembic_cfg, "head")
            logger.info("Database upgrade completed successfully.")
            success = True
        except Exception as e:
            logger.error(f"Database upgrade failed: {e}")
            print(f"Error: {e}")  # Print to captured stdout
            success = False
        finally:
            # Restore stdout/stderr
            sys.stdout = old_stdout
            sys.stderr = old_stderr
            # Remove handler
            root_logger.removeHandler(stream_handler)

        return success, log_capture.getvalue().splitlines()


# Global instance
_migration_service: Optional[DatabaseMigrationService] = None


def get_migration_service() -> DatabaseMigrationService:
    global _migration_service
    if _migration_service is None:
        _migration_service = DatabaseMigrationService()
    return _migration_service
