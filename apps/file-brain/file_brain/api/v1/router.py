"""
Main router for API v1
"""

from fastapi import APIRouter

from .endpoints import config, crawler, files, fs, settings, stats_extended, system, system_stream, watch_paths, wizard

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(wizard.router)
api_router.include_router(crawler.router)
api_router.include_router(settings.router)
api_router.include_router(watch_paths.router)
api_router.include_router(files.router)
api_router.include_router(fs.router)
api_router.include_router(system.router)
api_router.include_router(system_stream.router)
api_router.include_router(stats_extended.router)
api_router.include_router(config.router, prefix="/config", tags=["config"])
