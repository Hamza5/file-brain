"""
Application configuration using pydantic-settings
"""

import secrets

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# Import app metadata from pyproject.toml (single source of truth)
from file_brain.core.app_info import get_app_description, get_app_name, get_app_version


def import_secrets():
    return secrets


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
        env_prefix="FILEBRAIN_",
    )

    # Application - sourced from pyproject.toml
    app_name: str = get_app_name()
    app_version: str = get_app_version()
    app_description: str = get_app_description()
    debug: bool = False
    port: int = Field(default=8274, description="Default application port")
    host: str = Field(default="0.0.0.0", description="Default application host")

    # Typesense
    typesense_host: str = Field(default="localhost")
    typesense_port: int = Field(default=8108)
    typesense_protocol: str = Field(default="http")
    typesense_api_key: str = Field(
        default_factory=lambda: f"FILEBRAIN_{import_secrets().token_urlsafe(16)}",
        validate_default=False,
    )
    typesense_collection_name: str = Field(default="files")
    typesense_connection_timeout: int = Field(default=10, description="Connection timeout in seconds")
    typesense_model_download_timeout: int = Field(default=120, description="Timeout for model downloads in seconds")

    # Crawler
    watch_paths: str = Field(default="")  # Comma-separated paths
    max_file_size_mb: int = Field(default=100)

    # Frontend Development
    frontend_dev_url: str = Field(default="http://localhost:5173", description="URL for Vite dev server")
    frontend_dev_port: int = Field(default=5173, description="Port for Vite dev server")

    # Index Verification Settings
    verify_index_on_crawl: bool = Field(
        default=True,
        description="Verify indexed files exist and are accessible during crawl",
    )
    verification_batch_size: int = Field(
        default=100, description="Number of files to process in each verification batch"
    )
    max_verification_files: int = Field(default=10000, description="Maximum number of files to verify in a single run")
    cleanup_orphaned_files: bool = Field(default=True, description="Automatically clean up orphaned index entries")

    # Processing
    batch_size: int = Field(default=10)
    worker_queue_size: int = Field(default=1000)

    # Chunking
    chunk_size: int = Field(default=1000, description="Characters per chunk for indexing")
    chunk_overlap: int = Field(default=200, description="Overlapping characters between chunks")

    # Tika Server (Docker-based)
    tika_host: str = Field(default="localhost")
    tika_port: int = Field(default=9998)
    tika_protocol: str = Field(default="http")
    tika_enabled: bool = Field(default=True)
    tika_client_only: bool = Field(default=True)

    # PostHog Analytics
    posthog_project_api_key: str = Field(default="phc_cZAOKLFo8KyPxIs4VzoiQfg2a88Oyw7AeOfiHVR79t2")
    posthog_host: str = Field(default="https://eu.i.posthog.com")
    posthog_enabled: bool = Field(default=True)
    posthog_batch_flush_interval: int = Field(
        default=900, description="Interval in seconds to flush batched telemetry events (default: 15 minutes)"
    )

    @property
    def typesense_url(self) -> str:
        """Get full Typesense URL"""
        return f"{self.typesense_protocol}://{self.typesense_host}:{self.typesense_port}"

    @property
    def tika_url(self) -> str:
        """Get full Tika Server URL"""
        return f"{self.tika_protocol}://{self.tika_host}:{self.tika_port}"


# Global settings instance
settings = Settings()
