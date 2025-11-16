"""
Application configuration using pydantic-settings
"""
from typing import List
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# Import app metadata from pyproject.toml (single source of truth)
from utils.app_info import get_app_name, get_app_version, get_app_description


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Application - sourced from pyproject.toml
    app_name: str = get_app_name()
    app_version: str = get_app_version()
    app_description: str = get_app_description()
    debug: bool = False

    # Typesense
    typesense_host: str = Field(default="localhost")
    typesense_port: int = Field(default=8108)
    typesense_protocol: str = Field(default="http")
    typesense_api_key: str = Field(default="xyz-typesense-key")
    typesense_collection_name: str = Field(default="files")

    # Crawler
    watch_paths: str = Field(default="")  # Comma-separated paths
    max_file_size_mb: int = Field(default=100)

    # Processing
    batch_size: int = Field(default=10)
    worker_queue_size: int = Field(default=1000)
    
    # Tika Server (Docker-based)
    tika_host: str = Field(default="localhost")
    tika_port: int = Field(default=9998)
    tika_protocol: str = Field(default="http")
    tika_enabled: bool = Field(default=True)
    tika_client_only: bool = Field(default=True)
    
    # Initial scan (removed - now uses auto-resume based on previous state)
    

    @property
    def watch_paths_list(self) -> List[str]:
        """Get watch paths as list"""
        if not self.watch_paths:
            return []
        return [p.strip() for p in self.watch_paths.split(",") if p.strip()]

    @property
    def max_file_size_bytes(self) -> int:
        """Get max file size in bytes"""
        return self.max_file_size_mb * 1024 * 1024

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